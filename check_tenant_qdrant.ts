import { QdrantClient } from "@qdrant/js-client-rest";
import { env } from "./src/config/env.ts";

async function inspect() {
  const client = new QdrantClient({
    url: env.QDRANT_URL,
    apiKey: env.QDRANT_API_KEY
  });

  const tenantId = "bc2428a0-604b-45c9-a04b-01e390ccace8";
  
  const res = await client.scroll(env.QDRANT_COLLECTION, {
    filter: {
      must: [
        {
          key: "tenant_id",
          match: { value: tenantId }
        }
      ]
    },
    limit: 10,
    with_payload: true
  });

  console.log(`Found ${res.points.length} points for tenant ${tenantId}`);
  res.points.forEach(p => {
    console.log(`- Table: ${p.payload?.table_name}, Title: ${p.payload?.title}`);
  });
}

inspect();
