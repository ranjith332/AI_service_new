import { AiQueryService } from "./src/services/ai-query.service.ts";
import { loadSchemaMapping } from "./src/db/schema-mapping.ts";
import { DbExecutorService } from "./src/services/db-executor.service.ts";
import { QueryPlannerService } from "./src/services/query-planner.service.ts";
import { IntentService } from "./src/services/intent.service.ts";
import { LlmProvider } from "./src/llm/provider.ts";
import { DatabaseClient } from "./src/db/client.ts";
import { BookingService } from "./src/services/booking.service.ts";
import { VectorSearchService } from "./src/services/vector-search.service.ts";
import { ResponseGeneratorService } from "./src/services/response-generator.service.ts";

async function main() {
    const schema = await loadSchemaMapping();
    const dbClient = new DatabaseClient();
    const dbExecutor = new DbExecutorService(dbClient);
    const llm = new LlmProvider();
    const intentService = new IntentService(llm);
    const planner = new QueryPlannerService();
    const booking = new BookingService(dbExecutor, schema);
    const vector = new VectorSearchService();
    const responder = new ResponseGeneratorService(llm);
    
    const service = new AiQueryService(schema, intentService, planner, dbExecutor, booking, vector, responder);
    
    // MOCK INTENT
    const intent = {
        operation: "aggregate",
        metric: "count",
        targets: ["appointments"],
        filters: {
            date: "today",
            status: "completed"
        },
        summary: "count of completed appointments today",
        target: "appointments",
        needsSql: true,
        needsVector: false,
        confidence: 1
    };
    
    const input = {
        tenantId: "tenant-1",
        userQuery: "today completed appointments count",
        intent
    };
    
    console.log("--- STARTING MANUAL HANDLER DIAGNOSTIC ---");
    // We execute the lambda that contains the manual handler
    // We'll have to call a private method or just extract the logic... 
    // Actually, I'll just run a full classification and execution burst.
    
    const result = await service.execute({ tenantId: "tenant-1", userQuery: "today completed appointments count" });
    console.log("Answer:", result.answer);
}

main().catch(console.error);
