import { RunnableLambda, RunnableSequence } from "@langchain/core/runnables";

import { env } from "../config/env.ts";
import type { QueryResultRow } from "../db/client.ts";
import type { SchemaMapping } from "../db/schema-mapping.ts";
import type { ExecutionStrategy, QueryBody, QueryIntent } from "./query-schemas.ts";
import { IntentService } from "./intent.service.ts";
import { QueryPlannerService } from "./query-planner.service.ts";
import { SqlBuilderService } from "./sql-builder.service.ts";
import { DbExecutorService } from "./db-executor.service.ts";
import { VectorSearchService } from "./vector-search.service.ts";
import { ResponseGeneratorService } from "./response-generator.service.ts";
import { QueryCacheService } from "./cache.service.ts";
import { SchemaDiscoveryService } from "./schema-discovery.service.ts";
import { DynamicSqlPlannerService } from "./dynamic-sql-planner.service.ts";
import { SessionService } from "./session.service.ts";
import { BookingService } from "./booking.service.ts";
import { UnsupportedQueryError } from "../utils/errors.ts";
import { logger } from "../utils/logger.ts";

interface PipelineContext {
  tenantId: string;
  userQuery: string;
  sessionId?: string;
  intent?: QueryIntent;
  strategy?: ExecutionStrategy;
  sqlRows?: QueryResultRow[];
  vectorRows?: unknown[];
  provider?: "openai" | "nvidia_qwen";
  sqlMode?: "mapped" | "dynamic";
  answer?: string;
}

export class AiQueryService {
  constructor(
    private readonly schema: SchemaMapping,
    private readonly intentService: IntentService,
    private readonly planner: QueryPlannerService,
    private readonly sqlBuilder: SqlBuilderService,
    private readonly schemaDiscovery: SchemaDiscoveryService,
    private readonly dynamicSqlPlanner: DynamicSqlPlannerService,
    private readonly dbExecutor: DbExecutorService,
    private readonly vectorSearch: VectorSearchService,
    private readonly responseGenerator: ResponseGeneratorService,
    private readonly cache: QueryCacheService | null,
    private readonly sessionService: SessionService,
    private readonly bookingService: BookingService
  ) {}

  async execute(body: QueryBody) {
    const cacheKey = `${body.tenant_id}:${body.user_query.toLowerCase()}`;
    const cached = this.cache?.get<unknown>(cacheKey);
    if (cached) {
      return {
        ...(cached as Record<string, unknown>),
        meta: {
          ...((cached as { meta?: Record<string, unknown> }).meta ?? {}),
          cached: true
        }
      };
    }

    const pipeline = RunnableSequence.from<PipelineContext, any>([
      RunnableLambda.from(async (input: PipelineContext) => {
        const classified = await this.intentService.classify(input.tenantId, input.userQuery);
        
        // Handle Clarification
        if (classified.intent.operation === "book" && classified.intent.needsClarification) {
           return {
             ...input,
             intent: classified.intent,
             provider: classified.provider,
             answer: classified.intent.clarificationMessage ?? "I need more information to book your appointment. What is your name?"
           };
        }

        return {
          ...input,
          intent: classified.intent,
          provider: classified.provider
        };
      }),
      RunnableLambda.from(async (input: PipelineContext) => {
        if ((input as any).answer) return input; // Short-circuit if clarification sent

        const intent = input.intent!;
        
        // Handle Booking Execution
        if (intent.operation === "book") {
            const details = intent.bookingDetails;
            if (details.name && details.doctor && details.session !== "none") {
                const booking = await this.bookingService.validateAndBook({
                    tenantId: input.tenantId,
                    name: details.name!,
                    doctorName: details.doctor!,
                    session: details.session as any,
                    token: details.token ?? undefined,
                    date: (details.appointmentDate ?? new Date().toISOString().split('T')[0]) as string
                });

                return {
                    ...input,
                    answer: booking.message,
                    sqlRows: booking.appointmentId ? [{ id: booking.appointmentId }] : [],
                    strategy: "sql" as ExecutionStrategy
                };
            }
        }

        const plan = this.planner.plan(intent);

        const [sqlData, vectorRows] = await Promise.all([
          plan.runSql
            ? this.executeSqlPlan(input, plan)
            : Promise.resolve({ rows: [] as QueryResultRow[], mode: undefined as "mapped" | "dynamic" | undefined }),
          plan.runVector
            ? this.vectorSearch.search({
                tenantId: input.tenantId,
                query: input.userQuery,
                tableNames: plan.vectorTables
              })
            : Promise.resolve([] as unknown[])
        ]);

        return {
          ...input,
          strategy: plan.strategy,
          sqlRows: sqlData.rows,
          vectorRows,
          sqlMode: sqlData.mode
        };
      }),
      RunnableLambda.from(async (input: PipelineContext) => {
        if ((input as any).answer) return input; // Preserving clarify or booking response

        const generated = await this.responseGenerator.generate({
          tenantId: input.tenantId,
          userQuery: input.userQuery || "no query provided",
          intent: input.intent!,
          sqlRows: input.sqlRows ?? [],
          vectorRows: input.vectorRows ?? []
        });

        return {
          ...input,
          provider: generated.provider,
          answer: generated.answer
        };
      })
    ]);

    const result = await pipeline.invoke({
      tenantId: body.tenant_id,
      userQuery: body.user_query
    });

    const response = {
      tenant_id: body.tenant_id,
      answer: result.answer,
      data: {
        sql: {
          row_count: result.sqlRows?.length ?? 0,
          rows: result.sqlRows ?? []
        },
        vector: {
          row_count: result.vectorRows?.length ?? 0,
          rows: result.vectorRows ?? []
        }
      },
      meta: {
        strategy: result.strategy,
        provider: result.provider,
        sql_mode: result.sqlMode,
        cached: false
      }
    };

    if (result.intent?.operation === "book") {
      return {
        intent: "book_appointment",
        patient_name: result.intent.bookingDetails?.name || null,
        doctor_name: result.intent.bookingDetails?.doctor || null,
        session: result.intent.bookingDetails?.session || "none",
        token_number: result.intent.bookingDetails?.token || null,
        answer: result.answer,
        tenant_id: body.tenant_id
      };
    }

    if (this.cache) {
      this.cache.set(cacheKey, response);
    }

    return response;
  }

  private async executeSqlPlan(
    input: PipelineContext,
    plan: { runSql: boolean; runVector: boolean; strategy: ExecutionStrategy; vectorTables: string[] }
  ): Promise<{ rows: QueryResultRow[]; mode: "mapped" | "dynamic" | undefined }> {
    try {
      const query =
        input.intent!.target === "unknown"
          ? await this.buildDynamicQuery(input.tenantId, input.userQuery)
          : this.sqlBuilder.build({
              tenantId: input.tenantId,
              intent: input.intent!,
              schema: this.schema,
              timeZone: env.APP_TIMEZONE
            });

      logger.info({ query: query.text, values: query.values }, "Executing generated SQL query");
      const result = await this.dbExecutor.execute(query);
      return {
        rows: result.rows,
        mode: input.intent!.target === "unknown" ? "dynamic" : "mapped"
      };
    } catch (error) {
      logger.error({ error: error instanceof Error ? error.message : error }, "SQL query failed, attempting dynamic fallback");
      if (!(error instanceof UnsupportedQueryError)) {
        throw error;
      }

      const query = await this.buildDynamicQuery(input.tenantId, input.userQuery);
      logger.info({ query: query.text, values: query.values }, "Executing dynamic fallback SQL query");
      const result = await this.dbExecutor.execute(query);
      return {
        rows: result.rows,
        mode: "dynamic"
      };
    }
  }

  private async buildDynamicQuery(tenantId: string, userQuery: string) {
    const discoveredSchema = await this.schemaDiscovery.getAccessibleSchema();
    const schemaSummary = this.schemaDiscovery.formatSchemaSummary(discoveredSchema);
    const generated = await this.dynamicSqlPlanner.createPlan({
      tenantId,
      userQuery,
      schemaSummary
    });

    return this.sqlBuilder.buildDynamic({
      tenantId,
      plan: generated.plan,
      discoveredSchema
    });
  }
}
