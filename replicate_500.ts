import { AiQueryService } from "./src/services/ai-query.service.ts";
import { DatabaseClient } from "./src/db/client.ts";
import { BookingService } from "./src/services/booking.service.ts";
import { ResponseGeneratorService } from "./src/services/response-generator.service.ts";
import { IntentService } from "./src/services/intent.service.ts";
import { loadSchemaMapping } from "./src/db/schema-mapping.ts";
import { env } from "./src/config/env.ts";
import { QueryPlannerService } from "./src/services/query-planner.service.ts";
import { SqlBuilderService } from "./src/services/sql-builder.service.ts";
import { DbExecutorService } from "./src/services/db-executor.service.ts";
import { VectorSearchService } from "./src/services/vector-search.service.ts";
import { SessionService } from "./src/services/session.service.ts";
import { SchemaDiscoveryService } from "./src/services/schema-discovery.service.ts";
import { DynamicSqlPlannerService } from "./src/services/dynamic-sql-planner.service.ts";
import { PdfService } from "./src/services/pdf.service.ts";
import { LlmProvider } from "./src/llm/provider.ts";
import { QdrantService } from "./src/vector/qdrant.ts";

async function verifyFix() {
  const db = new DatabaseClient();
  const schema = await loadSchemaMapping();
  const booking = new BookingService(db, schema);
  const llm = new LlmProvider();
  
  const generator = new ResponseGeneratorService(llm);
  const intent = new IntentService(llm);
  const planner = new QueryPlannerService();
  const sqlBuilder = new SqlBuilderService(schema);
  const discovery = new SchemaDiscoveryService(db);
  const dynamicPlanner = new DynamicSqlPlannerService(llm);
  const executor = new DbExecutorService(db);
  const qdrant = new QdrantService();
  const vector = new VectorSearchService(llm, qdrant);
  const sessions = new SessionService();
  const pdf = new PdfService();

  const service = new AiQueryService(
    schema, intent, planner, sqlBuilder, discovery, dynamicPlanner,
    executor, vector, generator, null, sessions, booking, pdf
  );

  const query = "what are the tokens available for doctor Raju Boy for today";
  console.log(`--- Verifying Fix for Query: '${query}' ---`);
  
  try {
    const result = await service.execute({
      user_query: query,
      tenant_id: "bc2428a0-604b-45c9-a04b-01e390ccace8"
    }) as any;
    console.log("SUCCESS Response Answer:", result.answer);
    
    // Check if it triggered the autonomous discovery (HMS Sync)
    const hasDetailedTokens = result.data?.vector?.rows?.some((r: any) => r.type === "availability_info") || 
                             (result.vectorRows?.some((r: any) => r.type === "availability_info"));
                             
    if (hasDetailedTokens || result.answer.includes("I found available sessions") || result.answer.includes("available tokens")) {
        console.log("\n✅ HMS Sync Triggered Successfully!");
    } else {
        console.log("\n⚠️ HMS Sync was NOT triggered. Fallback happened.");
    }

  } catch (err: any) {
    console.error("FAILED with Error:", err.message);
    if (err.stack) console.error(err.stack);
  }
  
  process.exit(0);
}

verifyFix();
