import { LlmProvider } from "./src/llm/provider.ts";
import { QdrantService } from "./src/vector/qdrant.ts";

async function testSearch() {
  const llm = new LlmProvider();
  const qdrant = new QdrantService();

  const query = "show me recent appointments for prajan kumar";
  const tenantId = "bc2428a0-604b-45c9-a04b-01e390ccace8";
  const tableNames = ["prescriptions"]; // Example

  console.log("Generating embedding...");
  const embedding = await llm.embeddings.embedQuery(query);
  console.log("Vector length:", embedding.length);

  console.log("Searching Qdrant...");
  const results = await qdrant.search({
    tenantId,
    embedding,
    tableNames,
    limit: 5
  });

  console.log(`Found ${results.length} results.`);
  results.forEach(r => {
    console.log(`- Score: ${r.score}, Table: ${r.payload?.table_name}, Title: ${r.payload?.title}`);
  });
}

testSearch().catch(console.error);
