import { RunnableLambda, RunnableSequence } from "@langchain/core/runnables";

import { env } from "../config/env.ts";
import { ZodError } from "zod";
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
import { PdfService } from "./pdf.service.ts";
import { UnsupportedQueryError } from "../utils/errors.ts";
import { logger } from "../utils/logger.ts";
import { ChatSessionService } from "./chat-session.service.ts";
import { SqlChatMessageHistory } from "./sql-chat-history.ts";
import type { DatabaseClient } from "../db/client.ts";
import { HumanMessage, AIMessage, BaseMessage } from "@langchain/core/messages";

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
  pdfBase64?: string;
  history?: BaseMessage[];
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
    private readonly bookingService: BookingService,
    private readonly pdfService: PdfService,
    private readonly chatSessionService: ChatSessionService,
    private readonly db: DatabaseClient
  ) {}

  async execute(body: QueryBody) {
    let sessionId = body.session_id;
    let history: BaseMessage[] = [];

    // 1. Ensure Session exists and load/create as needed
    if (!sessionId) {
      const newSession = await this.chatSessionService.createSession(body.tenant_id, body.user_query);
      sessionId = newSession.id;
    } else {
      await this.chatSessionService.updateLastActivity(body.tenant_id, sessionId);
    }

    // 2. Initialize SQL-backed history
    const historyStore = new SqlChatMessageHistory(this.db, body.tenant_id, sessionId);
    const fullHistory = await historyStore.getMessages();
    history = fullHistory.slice(-6); // Only last 3 turns for context speed

    const cacheKey = `${body.tenant_id}:${body.user_query.toLowerCase()}`;
    const cached = this.cache?.get<unknown>(cacheKey);
    if (cached) {
      return {
        ...(cached as Record<string, unknown>),
        session_id: sessionId,
        meta: {
          ...((cached as { meta?: Record<string, unknown> }).meta ?? {}),
          cached: true
        }
      };
    }

    const pipeline = RunnableSequence.from<PipelineContext, any>([
      RunnableLambda.from(async (input: PipelineContext) => {
        let classified: { provider: string; intent: QueryIntent };
        try {
          classified = await this.intentService.classify(input.tenantId, input.userQuery, input.history) as any;
        } catch (error) {
          logger.warn({ userQuery: input.userQuery, error: error instanceof Error ? error.message : error }, "Intent classification failed, using basic fallback");
          classified = {
            provider: "fallback",
            intent: {
              summary: "Basic Fallback",
              operation: "list" as any,
              target: "unknown" as any,
              confidence: 0.5,
              needsSql: true,
              needsVector: true,
              timeRange: { preset: "all_time" }
            } as QueryIntent
          };
        }

        let intent = classified.intent;
        const q = input.userQuery.toLowerCase();

        // ✅ Override BAD INTENT (CRITICAL FIX)
        const doctorKeywords = ["doctor", "dr.", "dr ", "specialist", "experience", "bio", "about"];
        const isDoctorRelated = doctorKeywords.some(k => q.includes(k)) || q.includes("raju");

        if (
          (intent.target === "unknown" || intent.target === "doctors") && 
          isDoctorRelated && 
          intent.operation !== "aggregate" && 
          intent.operation !== "count"
        ) {
          intent.target = "doctors";
          // If it's descriptive, ensure vector is on
          if (q.includes("about") || q.includes("who is") || q.includes("experience") || q.includes("bio") || q.includes("tell me")) {
            intent.operation = "semantic_lookup" as any;
            intent.needsVector = true;
          }
          intent.needsSql = true;
          
          // Eager name extraction from query with robust cleaning (strip noise words and punctuation)
          let docName = input.userQuery
            .replace(/tell me about|who is|what is|info on|details of|search for|show me|find doctor|doctor|dr\.|dr|about|give me|specialist|experience|bio/gi, "")
            .replace(/[?,.!]/g, " ") // Remove punctuation
            .replace(/\b(his|her|details|info|please|now|today|profile|biography|specialty|exp|me|of)\b/gi, "") // Remove common noise words
            .trim()
            .replace(/\s+/g, " "); // Collapse internal spaces
          
          if (!docName || docName.length < 2) {
             const docMatch = input.userQuery.match(/(?:doctor|dr\.|dr)\s+([a-zA-Z\s]+)/i);
             if (docMatch?.[1]) docName = docMatch[1].trim();
          }

          if (docName) {
            intent.doctorName = docName.trim();
            // Don't overwrite summary if already descriptive
            if (!intent.summary || intent.summary.length < 5) intent.summary = `Details for Dr. ${docName.trim()}`;
          }
          
          logger.debug({ target: intent.target, operation: intent.operation, doctorName: intent.doctorName, needsVector: intent.needsVector }, "Doctor Intent Override applied");
          logger.info({ userQuery: input.userQuery, extractedName: docName, operation: intent.operation }, "Refined 'doctors' intent logic");
        }
        
        // Handle Clarification
        if (intent.operation === "book" && intent.needsClarification) {
           return {
             ...input,
             intent,
             provider: classified.provider,
             answer: intent.clarificationMessage ?? "I need more information to book your appointment. What is your name?"
           };
        }

        logger.info({ intent, provider: classified.provider }, "Intent Classified");

        return {
          ...input,
          intent,
          provider: classified.provider
        };
      }),
      RunnableLambda.from(async (input: PipelineContext) => {
        if ((input as any).answer) return input; // Short-circuit if clarification sent

        const intent = input.intent!;
        
        // Handle Booking and Appointment Discovery Execution
        const lowerQuery = input.userQuery.toLowerCase();
        const hasAvailabilityKeyword = lowerQuery.includes("token") || lowerQuery.includes("slot") || lowerQuery.includes("available");
        const isAvailabilityQuery = ((intent.target === "schedules" || intent.target === "scheduledays" || hasAvailabilityKeyword) && (intent.doctorName || hasAvailabilityKeyword));

        logger.info({ isAvailabilityQuery, hasAvailabilityKeyword, target: intent.target }, "Evaluating availability trigger");

        if (intent.operation === "book" || isAvailabilityQuery) {
            const details = intent.bookingDetails;
            let doctorName = details?.doctor || intent.doctorName;
            const patientName = details?.name || intent.patientName;
            const date = (details?.appointmentDate ?? new Date().toISOString().split('T')[0]) as string;

            // Robust doctor name fallback
            if (!doctorName && hasAvailabilityKeyword) {
                const docMatch = input.userQuery.match(/(?:doctor|dr\.)\s+([a-z\s]+?)(?:\s+for|today|tomorrow|on|$)/i);
                if (docMatch && docMatch[1]) doctorName = docMatch[1].trim();
            }

            if (doctorName) {
                if (patientName && details?.session && details.session !== "none" && intent.operation === "book") {
                    logger.info({ doctorName, patientName, session: details.session }, "Executing HMS synchronized booking");
                    const booking = await this.bookingService.validateAndBook({
                        tenantId: input.tenantId,
                        name: patientName,
                        doctorName: doctorName || "",
                        session: details.session as any,
                        token: details.token ?? undefined,
                        date
                    });

                    return {
                        ...input,
                        answer: booking.message,
                        sqlRows: booking.appointmentId ? [{ id: booking.appointmentId }] : [],
                        strategy: "sql" as ExecutionStrategy
                    };
                } else {
                    // Autonomous Session Lookup for availability
                    logger.info({ doctorName }, "Fetching HMS synchronized availability");
                    const availableSessions = await this.bookingService.getAvailableSessions(input.tenantId, doctorName || "", date);
                    logger.info({ sessionsCount: availableSessions.length }, "Available sessions found");

                    if (availableSessions.length > 0) {
                        const availabilityMap: Record<string, any[]> = {};
                        for (const session of availableSessions) {
                            availabilityMap[session] = await this.bookingService.getAvailableTokensDetailed(input.tenantId, doctorName, date, session);
                        }
                        const vectorRows = [...(input.vectorRows ?? [])];
                        vectorRows.push({
                            type: "availability_info",
                            date,
                            doctor: doctorName,
                            available_sessions: availableSessions,
                            detailed_tokens: availabilityMap,
                            hint: "Users can book the tokens marked as 'available'. 'blocked' tokens are reserved for the hospital system."
                        });
                        return {
                            ...input,
                            vectorRows,
                            sqlRows: [],
                            answer: `I found available sessions for Dr. ${doctorName} on ${date}: ${availableSessions.join(", ")}. Which one should I book for ${patientName || 'the patient'}?`,
                            strategy: "sql" as ExecutionStrategy
                        };
                    }
                }
            }
        }

        // Handle General Knowledge Execution
        if (intent.operation === "general_knowledge") {
            return {
                ...input,
                sqlRows: [],
                vectorRows: [],
                strategy: "sql" as ExecutionStrategy
            };
        }

        // MANUAL AGGREGATION HANDLER: Bypass LLM for simple count queries
        if (intent.operation === "aggregate" && intent.metric === "count" && intent.targets && intent.targets.length > 0) {
            const subqueries: string[] = [];
            const values: any[] = [];
            
            const tableMap: Record<string, string> = {
                'patients': 'patients',
                'doctors': 'doctors',
                'appointments': 'appointments',
                'prescriptions': 'prescriptions',
                'medicines': 'medicines'
            };

            for (const target of intent.targets) {
                const tableName = tableMap[target.toLowerCase()];
                if (tableName) {
                    const entityMapping = (this.schema as any)[tableName];
                    if (entityMapping) {
                        const tenantCol = entityMapping.tenant || "tenant_id";
                        const whereParts = [`${tenantCol} = ?`];
                        const whereValues: any[] = [input.tenantId];

                        // Apply Granular Filters
                        const f = intent.filters || {};
                        
                        // 1. Status Filter
                        if (f.status) {
                            const statusCol = entityMapping.isCompleted || entityMapping.status || "status";
                            whereParts.push(`${statusCol} = ?`);
                            // Appointments use 0/1 for is_completed
                            const statusVal = (tableName === "appointments" && (f.status === "completed" || f.status === "1")) ? 1 : 
                                            (tableName === "appointments" && (f.status === "pending" || f.status === "0")) ? 0 : f.status;
                            whereValues.push(statusVal);
                        }

                        // 2. Date Filter
                        const dateColName = entityMapping.scheduledAt || entityMapping.createdAt || "created_at";
                        if (f.date === "today") {
                            whereParts.push(`DATE(${dateColName}) >= CURDATE()`);
                        } else if (f.date === "yesterday") {
                            whereParts.push(`DATE(${dateColName}) >= DATE_SUB(CURDATE(), INTERVAL 1 DAY) AND DATE(${dateColName}) < CURDATE()`);
                        } else if (f.date && f.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
                            // Specific date YYYY-MM-DD
                            whereParts.push(`DATE(${dateColName}) = ?`);
                            whereValues.push(f.date);
                        }

                        // 3. Department Filter
                        if (f.department) {
                            const deptCol = entityMapping.department || "department_id";
                            whereParts.push(`${deptCol} = ?`);
                            whereValues.push(f.department);
                        }

                        // 4. Experience Filter (Doctors Only)
                        if (tableName === "doctors" && f.minExperience) {
                            const createdCol = entityMapping.createdAt || "created_at";
                            whereParts.push(`TIMESTAMPDIFF(YEAR, ${createdCol}, NOW()) >= ?`);
                            whereValues.push(f.minExperience);
                        }

                        subqueries.push(`(SELECT COUNT(*) FROM \`${entityMapping.table}\` WHERE ${whereParts.join(" AND ")}) AS total_${tableName}`);
                        values.push(...whereValues);
                    }
                }
            }

            if (subqueries.length > 0) {
                const sqlText = `SELECT ${subqueries.join(", ")}`;
                console.log(`[DIAGNOSTIC] Manual SQL: ${sqlText}`);
                console.log(`[DIAGNOSTIC] Values: ${JSON.stringify(values)}`);
                logger.info({ targets: intent.targets, filters: intent.filters, sql: sqlText }, "Executing filtered manual aggregation");
                
                const sqlData = await this.dbExecutor.execute<any>({
                    text: sqlText,
                    values,
                    description: "manual_aggregation_count_filtered"
                });

                return {
                    ...input,
                    sqlRows: sqlData.rows,
                    vectorRows: [],
                    strategy: "sql" as ExecutionStrategy,
                    mode: "mapped" as any
                };
            }
        }

        const plan = this.planner.plan(intent);
        logger.info({ strategy: plan.strategy, runSql: plan.runSql, runVector: plan.runVector, target: intent.target }, "Execution Plan Generated");

        let [sqlData, vectorRows] = await Promise.all([
          plan.runSql
            ? this.executeSqlPlan(input, plan)
            : Promise.resolve({ rows: [] as QueryResultRow[], mode: undefined as "mapped" | "dynamic" | undefined }),
          plan.runVector
            ? this.vectorSearch.search({
                tenantId: input.tenantId,
                query: input.userQuery,
                tableNames: plan.vectorTables
              }).catch(err => {
                logger.error({ error: err.message, userQuery: input.userQuery }, "Primary vector search failed. Continuing with SQL only.");
                return [] as unknown[];
              })
            : Promise.resolve([] as unknown[])
        ]);

        // AUTOMATIC FALLBACK: If SQL & initial Vector results are empty, trigger a broader vector search as a safety net
        // EXCEPTION: Never fallback to vector for aggregations/counts
        if (sqlData.rows.length === 0 && vectorRows.length === 0 && intent.operation !== "aggregate" && intent.operation !== "count") {
            logger.info({ userQuery: input.userQuery, originalPlan: plan.strategy }, "No direct matches found. Triggering semantic fallback.");
            try {
                vectorRows = await this.vectorSearch.search({
                    tenantId: input.tenantId,
                    query: input.userQuery,
                    tableNames: plan.vectorTables.length > 0 ? plan.vectorTables : ["patients", "prescriptions", "medicines", "doctors"]
                });
                logger.debug({ count: vectorRows.length }, "Semantic fallback vector search complete");
            } catch (err: any) {
                logger.error({ error: err.message, userQuery: input.userQuery }, "Semantic fallback vector search also failed.");
                vectorRows = [];
            }
        }

        // DEEP DIVE: For individual doctor lookups, append their availability/sessions to "all details"
        if (intent.target === "doctors" && intent.doctorName && sqlData.rows.length > 0) {
            const dr = sqlData.rows[0];
            const date = new Date().toISOString().split("T")[0];
            try {
                const sessions = await this.bookingService.getAvailableSessions(input.tenantId, intent.doctorName as string, date);
                if (sessions.length > 0) {
                    (dr as any).available_sessions_today = sessions.join(", ");
                }
            } catch (e) {
                logger.warn({ error: e, doctor: intent.doctorName }, "Doctor session deep-dive failed");
            }
        }

        return {
          ...input,
          strategy: plan.strategy,
          sqlRows: sqlData.rows,
          vectorRows,
          sqlMode: sqlData.mode
        };
      }),
      RunnableLambda.from(async (input: PipelineContext) => {
        if (input.answer) return input;

        // Handle PDF Export
        const intent = input.intent!;
        if (intent.operation === "export_pdf" && (intent.patientName || intent.patientId)) {
            let patientId: number | undefined;
            if (intent.patientId) {
                patientId = intent.patientId;
            } else if (intent.patientName) {
                const patient = await this.bookingService.findPatient(input.tenantId, intent.patientName);
                patientId = patient?.id;
            }

            if (!patientId) {
                return { ...input, answer: `I couldn't find a patient named '${intent.patientName}' to export the prescription.` };
            }

            const p = this.schema.patients;
            const rxTable = this.schema.prescriptions.table;
            const d = this.schema.doctors;
            const m = this.schema.medicines;
            
            // Fetch prescription + details
            const res = await this.dbExecutor.execute<any>({
                text: `
                    SELECT 
                        rx.*,
                        CONCAT(p.first_name, ' ', p.last_name) as patient_full_name,
                        p.dob, p.gender,
                        CONCAT(dr.first_name, ' ', dr.last_name) as doctor_full_name,
                        dr.specialist,
                        pm.dosage, pm.day as duration, pm.time, pm.comment as med_comment,
                        med.name as medicine_name
                    FROM ${rxTable} rx
                    INNER JOIN ${p.table} p ON p.id = rx.patient_id
                    INNER JOIN ${d.table} dr ON dr.id = rx.doctor_id
                    LEFT JOIN prescriptions_medicines pm ON pm.prescription_id = rx.id
                    LEFT JOIN ${m.table} med ON med.id = pm.medicine
                    WHERE rx.tenant_id = ? AND rx.patient_id = ?
                    ORDER BY rx.created_at DESC
                `,
                values: [input.tenantId, patientId],
                description: "fetch_rx_for_pdf"
            });

            if (res.rows.length === 0) {
                return { ...input, answer: `No prescriptions found for ${intent.patientName}.` };
            }

            // Group medicines
            const firstRow = res.rows[0];
            const medicines = res.rows
                .filter(r => r.medicine_name)
                .map(r => ({
                    name: r.medicine_name,
                    dosage: r.dosage,
                    duration: `${r.duration} days`,
                    time: r.time,
                    comment: r.med_comment
                }));

            const pdfBuffer = await this.pdfService.generatePrescriptionPdf({
                id: firstRow.id || firstRow.prescription_id,
                patientName: firstRow.patient_full_name,
                patientGender: firstRow.gender,
                doctorName: firstRow.doctor_full_name,
                doctorSpeciality: firstRow.specialist,
                date: new Date(firstRow.created_at).toLocaleDateString(),
                problem: firstRow.problem_description,
                test: firstRow.test,
                advice: firstRow.advice,
                medicines
            });

            return {
                ...input,
                intent: { ...intent, operation: "export_pdf" as any },
                answer: `Your prescription PDF for ${intent.patientName} has been generated.`,
                pdfBase64: pdfBuffer.toString("base64")
            };
        }

        const generated = await this.responseGenerator.generate({
          tenantId: input.tenantId,
          userQuery: input.userQuery || "no query provided",
          intent: input.intent!,
          sqlRows: input.sqlRows ?? [],
          vectorRows: input.vectorRows ?? [],
          timeZone: env.APP_TIMEZONE,
          history: input.history
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
      userQuery: body.user_query,
      sessionId,
      history
    });

    // 3. Persist the current interaction to SQL history
    await historyStore.addMessage(new HumanMessage(body.user_query));
    await historyStore.addMessage(new AIMessage(result.answer));

    if (result.intent?.operation === "export_pdf") {
      return {
        intent: "export_pdf_result",
        patient_name: result.intent.patientName,
        answer: result.answer,
        pdf_base64: result.pdfBase64,
        tenant_id: body.tenant_id,
        session_id: sessionId
      };
    }

    const response = {
      tenant_id: body.tenant_id,
      session_id: sessionId,
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
          ? await this.buildDynamicQuery(input.tenantId, input.userQuery, input.intent?.target)
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
      if (error instanceof ZodError) {
        logger.error({ error: error.issues, userQuery: input.userQuery }, "Dynamic SQL plan validation failed. Falling back to conversational response.");
      } else {
        logger.error({ error: error instanceof Error ? error.message : error, userQuery: input.userQuery }, "SQL execution failed. Falling back to conversational response.");
      }
      
      return {
        rows: [],
        mode: undefined
      };
    }
  }

  private async buildDynamicQuery(tenantId: string, userQuery: string, target?: string) {
    const discoveredSchema = await this.schemaDiscovery.getAccessibleSchema();
    const schemaSummary = this.schemaDiscovery.formatPrunedSchemaSummary(discoveredSchema, target);
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
