import { QdrantClient } from "@qdrant/js-client-rest";
import { env } from "./src/config/env.ts";

async function inspect() {
  const client = new QdrantClient({
    url: env.QDRANT_URL,
    apiKey: env.QDRANT_API_KEY
  });

  const res = await client.scroll(env.QDRANT_COLLECTION, {
    limit: 10,
    with_payload: true
  });

  console.log("Current Points in Qdrant:");
  res.points.forEach(p => {
    console.log(`- ID: ${p.id}, Tenant: ${p.payload?.tenant_id}, Table: ${p.payload?.table_name}, Title: ${p.payload?.title}`);
  });
}

inspect();
