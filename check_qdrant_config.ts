import { QdrantClient } from "@qdrant/js-client-rest";
import { env } from "./src/config/env.ts";

async function check() {
  const client = new QdrantClient({
    url: env.QDRANT_URL,
    apiKey: env.QDRANT_API_KEY
  });

  const info = await client.getCollection(env.QDRANT_COLLECTION);
  console.log("Collection Info:");
  console.log(JSON.stringify(info, null, 2));
}

check();
