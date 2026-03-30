import { AiQueryService } from "./src/services/ai-query.service.ts";
import { IntentService } from "./src/services/intent.service.ts";
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
import { DatabaseClient } from "./src/db/client.ts";
import { LlmProvider } from "./src/llm/provider.ts";
import { loadSchemaMapping } from "./src/db/schema-mapping.ts";
import { QdrantService } from "./src/vector/qdrant.ts";

async function diag() {
    const schemaMapping = await loadSchemaMapping();
    const db = new DatabaseClient();
    const llm = new LlmProvider();
    const qdrant = new QdrantService();
    
    const aiQueryService = new AiQueryService(
        schemaMapping,
        new IntentService(llm),
        new QueryPlannerService(),
        new SqlBuilderService(schemaMapping),
        new SchemaDiscoveryService(db),
        new DynamicSqlPlannerService(llm),
        new DbExecutorService(db),
        new VectorSearchService(llm, qdrant),
        new ResponseGeneratorService(llm),
        null,
        new SessionService(),
        new BookingService(db, schemaMapping),
        new PdfService()
    );

    const body = {
        tenant_id: "bc2428a0-604b-45c9-a04b-01e390ccace8",
        user_query: "who is doctor raju boy"
    };

    console.log("Starting Diagnostic execution for:", body.user_query);
    try {
        const response = await aiQueryService.execute(body);
        console.log("Success! Response answer:", response.answer);
        console.log("Safe Rows found:", response.data.sql.row_count);
    } catch (error) {
        console.error("DIAGNOSTIC FAILED:", error);
    }
    process.exit(0);
}

diag().catch(console.error);
