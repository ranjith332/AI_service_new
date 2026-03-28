import { QdrantClient } from "@qdrant/js-client-rest";
import { env } from "./src/config/env.ts";

async function inspect() {
  const client = new QdrantClient({
    url: env.QDRANT_URL,
    apiKey: env.QDRANT_API_KEY
  });

  const scrollRes = await client.scroll(env.QDRANT_COLLECTION, {
    limit: 100,
    with_payload: true
  });

  const stats: Record<string, number> = {};
  scrollRes.points.forEach(p => {
    const key = `${p.payload?.tenant_id}:${p.payload?.table_name}`;
    stats[key] = (stats[key] ?? 0) + 1;
  });

  console.log("Point stats (Tenant:Table):");
  console.log(JSON.stringify(stats, null, 2));
}

inspect();
