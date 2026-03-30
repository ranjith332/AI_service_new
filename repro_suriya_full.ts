import { DatabaseClient } from "./src/db/client.ts";
import { loadSchemaMapping } from "./src/db/schema-mapping.ts";
import { IntentService } from "./src/services/intent.service.ts";
import { LlmProvider } from "./src/llm/provider.ts";
import { BookingService } from "./src/services/booking.service.ts";
import { AiQueryService } from "./src/services/ai-query.service.ts";
import { QueryPlannerService } from "./src/services/query-planner.service.ts";
import { SqlBuilderService } from "./src/services/sql-builder.service.ts";
import { SchemaDiscoveryService } from "./src/services/schema-discovery.service.ts";
import { DynamicSqlPlannerService } from "./src/services/dynamic-sql-planner.service.ts";
import { DbExecutorService } from "./src/services/db-executor.service.ts";
import { VectorSearchService } from "./src/services/vector-search.service.ts";
import { ResponseGeneratorService } from "./src/services/response-generator.service.ts";
import { SessionService } from "./src/services/session.service.ts";
import { PdfService } from "./src/services/pdf.service.ts";
import { QdrantService } from "./src/vector/qdrant.ts";

const tenantId = "bc2428a0-604b-45c9-a04b-01e390ccace8";
const userQuery = "give me the pdf of SURIYA D prescription";

async function run() {
  const db = new DatabaseClient();
  const schemaMapping = await loadSchemaMapping();
  const llm = new LlmProvider();
  const qdrant = new QdrantService();
  
  const intentService = new IntentService(llm);
  const planner = new QueryPlannerService();
  const sqlBuilder = new SqlBuilderService(schemaMapping);
  const schemaDiscovery = new SchemaDiscoveryService(db);
  const dynamicSqlPlanner = new DynamicSqlPlannerService(llm);
  const dbExecutor = new DbExecutorService(db);
  const vectorSearch = new VectorSearchService(llm, qdrant);
  const responseGenerator = new ResponseGeneratorService(llm);
  const sessionService = new SessionService();
  const bookingService = new BookingService(db, schemaMapping);
  const pdfService = new PdfService();

  const aiQueryService = new AiQueryService(
    schemaMapping,
    intentService,
    planner,
    sqlBuilder,
    schemaDiscovery,
    dynamicSqlPlanner,
    dbExecutor,
    vectorSearch,
    responseGenerator,
    null,
    sessionService,
    bookingService,
    pdfService
  );

  console.log("--- Executing Full Pipeline ---");
  const result = await aiQueryService.execute({
    tenant_id: tenantId,
    user_query: userQuery
  });

  console.log("Full Result:", JSON.stringify(result, null, 2));

  if (result.intent === "export_pdf_result") {
     console.log("SUCCESS: pdf_base64 found!");
  } else {
     console.log("FAILURE: Not an export_pdf_result");
  }

  process.exit(0);
}

run().catch(console.error);
