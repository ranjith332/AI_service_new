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
import { UnsupportedQueryError } from "../utils/errors.ts";

interface PipelineContext {
  tenantId: string;
  userQuery: string;
  intent?: QueryIntent;
  strategy?: ExecutionStrategy;
  sqlRows?: QueryResultRow[];
  vectorRows?: unknown[];
  provider?: "openai" | "nvidia_qwen";
  sqlMode?: "mapped" | "dynamic";
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
    private readonly cache: QueryCacheService | null
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

    const pipeline = RunnableSequence.from<PipelineContext, PipelineContext & { answer: string }>([
      RunnableLambda.from(async (input: PipelineContext) => {
        const classified = await this.intentService.classify(input.tenantId, input.userQuery);
        return {
          ...input,
          intent: classified.intent,
          provider: classified.provider
        };
      }),
      RunnableLambda.from(async (input: PipelineContext) => {
        const plan = this.planner.plan(input.intent!);

        let sqlRows: QueryResultRow[] = [];
        let vectorRows: unknown[] = [];
        let sqlMode: "mapped" | "dynamic" | undefined;

        if (plan.runSql) {
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

            sqlRows = (await this.dbExecutor.execute(query)).rows;
            sqlMode = input.intent!.target === "unknown" ? "dynamic" : "mapped";
          } catch (error) {
            if (!(error instanceof UnsupportedQueryError)) {
              throw error;
            }

            const query = await this.buildDynamicQuery(input.tenantId, input.userQuery);
            sqlRows = (await this.dbExecutor.execute(query)).rows;
            sqlMode = "dynamic";
          }
        }

        if (plan.runVector) {
          vectorRows = await this.vectorSearch.search({
            tenantId: input.tenantId,
            query: input.userQuery,
            tableNames: plan.vectorTables
          });
        }

        return {
          ...input,
          strategy: plan.strategy,
          sqlRows,
          vectorRows,
          sqlMode
        };
      }),
      RunnableLambda.from(async (input: PipelineContext) => {
        const generated = await this.responseGenerator.generate({
          tenantId: input.tenantId,
          userQuery: input.userQuery,
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

    if (this.cache) {
      this.cache.set(cacheKey, response);
    }

    return response;
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
