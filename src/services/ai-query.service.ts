import { IntentService } from "./intent.service.ts";
import { QueryPlannerService } from "./query-planner.service.ts";
import { SqlBuilderService } from "./sql-builder.service.ts";
import { DatabaseClient } from "../db/client.ts";
import { LlmProvider } from "../llm/provider.ts";
import { logger } from "../utils/logger.ts";
import { type QueryPlan } from "./query-schemas.ts";
import { ChatSessionService } from "./chat-session.service.ts";
import { ResponseGeneratorService } from "./response-generator.service.ts";
import { VectorSearchService } from "./vector-search.service.ts";
import { PdfService } from "./pdf.service.ts";

export class AiQueryService {
  private readonly intentService: IntentService;
  private readonly queryPlanner: QueryPlannerService;
  private readonly sqlBuilder: SqlBuilderService;
  private readonly responseGenerator: ResponseGeneratorService;
  private readonly vectorSearch: VectorSearchService;
  private readonly pdfService: PdfService;

  constructor(
    private readonly llm: LlmProvider,
    private readonly db: DatabaseClient,
    private readonly chatSession: ChatSessionService
  ) {
    this.intentService = new IntentService(this.llm);
    this.queryPlanner = new QueryPlannerService();
    this.sqlBuilder = new SqlBuilderService();
    this.responseGenerator = new ResponseGeneratorService(this.llm);
    this.vectorSearch = new VectorSearchService();
    this.pdfService = new PdfService(this.db);
  }

  async handle(query: string, tenantId: string = "default", sessionId?: string): Promise<any> {
    logger.info({ query, tenantId, sessionId }, "🚀 PROCESSING AI QUERY");

    try {
      // 1. Get History
      const history = sessionId ? await this.chatSession.getHistory(sessionId) : "";

      // 2. Intent Classification
      logger.info({ query }, "📝 STEP 2: CLASSIFYING INTENT");
      const intent = await this.intentService.classify(query, history);
      logger.info({ 
        operation: intent.operation, 
        targets: intent.targets, 
        filters: intent.filters,
        justification: intent.justification 
      }, "🎯 INTENT CLASSIFIED");

      // 3. Planning
      logger.info("📅 STEP 3: GENERATING QUERY PLAN");
      const plan = this.queryPlanner.plan(intent);
      logger.info({ actions: plan.actions.map(a => a.type) }, "📋 PLAN GENERATED");

      let sqlResults: any[] = [];
      let vectorResults: any[] = [];

      // 4. Execution
      logger.info("⚙️ STEP 4: EXECUTING ACTIONS");
      for (const action of plan.actions) {
        if (action.type === "sql") {
          const { text, values } = this.sqlBuilder.build(intent, tenantId);
          logger.info({ sql: text, values }, "🔍 EXECUTING SQL");
          const result = await this.db.query({ text, values, description: action.description });
          sqlResults = result.rows;
          logger.info({ rowCount: result.rowCount }, "📊 SQL EXECUTION COMPLETE");
        } else if (action.type === "vector") {
          logger.info({ query }, "🧬 EXECUTING VECTOR SEARCH");
          const results = await this.vectorSearch.search(tenantId, query, 5);
          vectorResults = results;
          logger.info({ matchCount: results.length }, "🧬 VECTOR SEARCH COMPLETE");
        } else if (action.type === "pdf") {
          logger.info("📄 EXECUTING PDF GENERATION");
          if (sqlResults.length > 0 && sqlResults[0].id) {
            try {
              const pdfUrl = await this.pdfService.generatePrescriptionPdf(sqlResults[0].id, tenantId);
              logger.info({ pdfUrl }, "✅ PDF GENERATED SUCCESSFULLY");
              (intent as any).pdfUrl = pdfUrl;
            } catch (err: any) {
              logger.error({ error: err.message }, "❌ PDF GENERATION FAILED");
            }
          } else {
            logger.warn("⚠️ SKIPPING PDF: No prescription data found in SQL results");
          }
        }
      }

      // 5. Response Generation
      logger.info({ 
        hasSql: sqlResults.length > 0, 
        pdfUrl: (intent as any).pdfUrl || "none" 
      }, "💬 STEP 5: GENERATING FINAL RESPONSE");
      const response = await this.responseGenerator.generate(query, { sql: sqlResults, vector: vectorResults }, intent, history);
      logger.info({ responseLength: response.length }, "✨ RESPONSE GENERATED");

      return {
        intent,
        plan,
        response,
        results: {
          sql: sqlResults,
          vector: vectorResults,
        },
      };
    } catch (error: any) {
      logger.error({ error: error.message, stack: error.stack }, "❌ AI QUERY FAILED");
      throw error;
    }
  }
}
