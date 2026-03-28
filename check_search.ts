import { QdrantService } from "./src/vector/qdrant.ts";

async function check() {
  const qdrant = new QdrantService();
  const res = await qdrant.search({
    tenantId: "bc2428a0-604b-45c9-a04b-01e390ccace8",
    embedding: new Array(1024).fill(0), // Dummy search
    tableNames: ["medicines"],
    limit: 1
  });
  console.log("Search result count:", res.length);
  if (res.length > 0) {
    console.log("Found payload:", JSON.stringify(res[0].payload, null, 2));
  }
}

check();
