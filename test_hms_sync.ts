import { AiQueryService } from "./src/services/ai-query.service.ts";
import { DatabaseClient } from "./src/db/client.ts";
import { loadSchemaMapping } from "./src/db/schema-mapping.ts";
import { IntentService } from "./src/services/intent.service.ts";
import { LlmProvider } from "./src/llm/provider.ts";
import { QueryPlannerService } from "./src/services/query-planner.service.ts";
import { SqlBuilderService } from "./src/services/sql-builder.service.ts";
import { DbExecutorService } from "./src/services/db-executor.service.ts";
import { VectorSearchService } from "./src/services/vector-search.service.ts";
import { ResponseGeneratorService } from "./src/services/response-generator.service.ts";
import { SchemaDiscoveryService } from "./src/services/schema-discovery.service.ts";
import { DynamicSqlPlannerService } from "./src/services/dynamic-sql-planner.service.ts";
import { SessionService } from "./src/services/session.service.ts";
import { BookingService } from "./src/services/booking.service.ts";
import { PdfService } from "./src/services/pdf.service.ts";
import { ChatSessionService } from "./src/services/chat-session.service.ts";
import { QueryCacheService } from "./src/services/cache.service.ts";
import { QdrantService } from "./src/vector/qdrant.ts";

async function runTests() {
  console.log("🚀 Starting HMS Sync Verification Tests...");

  const db = new DatabaseClient();
  const schema = await loadSchemaMapping();
  const llm = new LlmProvider();
  const qdrant = new QdrantService();
  
  const intentService = new IntentService(llm);
  const planner = new QueryPlannerService();
  const sqlBuilder = new SqlBuilderService(schema);
  const dbExecutor = new DbExecutorService(db);
  const vectorSearch = new VectorSearchService(llm, qdrant);
  const responseGenerator = new ResponseGeneratorService(llm);
  const schemaDiscovery = new SchemaDiscoveryService(db);
  const dynamicSqlPlanner = new DynamicSqlPlannerService(llm);
  const sessionService = new SessionService();
  const bookingService = new BookingService(db, schema);
  const pdfService = new PdfService();
  const chatSessionService = new ChatSessionService(db);
  const cache = new QueryCacheService(600000);

  const aiService = new AiQueryService(
    schema, intentService, planner, sqlBuilder, schemaDiscovery,
    dynamicSqlPlanner, dbExecutor, vectorSearch, responseGenerator,
    cache, sessionService, bookingService, pdfService, chatSessionService, db
  );

  const tenantId = "00cf2631-d9cb-48b7-ae55-47f75754500d"; 

  // Test 1: Doctor Knowledge (Vector check)
  console.log("\n--- Test 1: Doctor Biography (Vector) ---");
  const res1: any = await aiService.execute({
    tenant_id: tenantId,
    user_query: "Who is Dr. Ramesh Kumar? Tell me about his experience."
  });
  console.log("AI Answer:", res1.answer);

  // Test 2: Availability (Sync Logic check)
  console.log("\n--- Test 2: Availability (HMS logic check) ---");
  const res2: any = await aiService.execute({
    tenant_id: tenantId,
    user_query: "What slots are available for Dr. Ramesh today?"
  });
  console.log("AI Answer:", res2.answer);

  // Test 3: Booking (Create Appointment check)
  console.log("\n--- Test 3: Booking Appointment ---");
  const res3: any = await aiService.execute({
    tenant_id: tenantId,
    user_query: "Book an appointment for Amit Sharma in the morning session with Dr. Ramesh Kumar today",
    session_id: res1.session_id 
  });
  console.log("AI Answer:", res3.answer);

  await db.close();
  console.log("\n✅ All tests completed.");
}

runTests().catch(console.error);

