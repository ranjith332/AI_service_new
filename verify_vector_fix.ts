import { AiQueryService } from "./src/services/ai-query.service.ts";
import { IntentService } from "./src/services/intent.service.ts";
import { QueryPlannerService } from "./src/services/query-planner.service.ts";
import { SqlBuilderService } from "./src/services/sql-builder.service.ts";
import { DbExecutorService } from "./src/services/db-executor.service.ts";
import { VectorSearchService } from "./src/services/vector-search.service.ts";
import { ResponseGeneratorService } from "./src/services/response-generator.service.ts";
import { SchemaDiscoveryService } from "./src/services/schema-discovery.service.ts";
import { DynamicSqlPlannerService } from "./src/services/dynamic-sql-planner.service.ts";
import { DatabaseClient } from "./src/db/client.ts";
import { LlmProvider } from "./src/llm/provider.ts";
import { loadSchemaMapping } from "./src/db/schema-mapping.ts";
import { QdrantService } from "./src/vector/qdrant.ts";

async function test() {
  const schema = await loadSchemaMapping();
  const db = new DatabaseClient();
  const llm = new LlmProvider();
  const qdrant = new QdrantService();
  
  const intentService = new IntentService(llm);
  const planner = new QueryPlannerService();
  const sqlBuilder = new SqlBuilderService();
  const schemaDiscovery = new SchemaDiscoveryService(db);
  const dynamicSqlPlanner = new DynamicSqlPlannerService(llm);
  const dbExecutor = new DbExecutorService(db);
  const vectorSearch = new VectorSearchService(llm, qdrant);
  const responseGenerator = new ResponseGeneratorService(llm);

  const service = new AiQueryService(
    schema,
    intentService,
    planner,
    sqlBuilder,
    schemaDiscovery,
    dynamicSqlPlanner,
    dbExecutor,
    vectorSearch,
    responseGenerator,
    null
  );

  console.log("Testing Vector Retrieval Fix...");
  try {
    const result = (await service.execute({
      tenant_id: "bc2428a0-604b-45c9-a04b-01e390ccace8",
      user_query: "show me recent prescriptions and notes for patients"
    })) as any;
    console.log("Strategy:", result.meta.strategy);
    console.log("Vector Row Count:", result.data.vector.row_count);
    if (result.data.vector.row_count > 0) {
      console.log("First Vector Result:", result.data.vector.rows[0].payload?.title);
    }
    console.log("Answer extracted:", result.answer.substring(0, 100) + "...");
  } catch (error: any) {
    console.error("Test failed:", error);
  } finally {
    await db.close();
  }
}

test();
