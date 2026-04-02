import { QdrantClient } from "@qdrant/js-client-rest";
import { env } from "../src/config/env.ts";

async function main() {
  if (!env.QDRANT_URL) {
    console.error("QDRANT_URL not set");
    return;
  }

  const client = new QdrantClient({
    url: env.QDRANT_URL,
    apiKey: env.QDRANT_API_KEY,
  });

  console.log(`Checking collection: ${env.QDRANT_COLLECTION}`);

  try {
    const response = await client.scroll(env.QDRANT_COLLECTION, {
      limit: 5,
      with_payload: true,
      with_vector: false,
    });

    console.log("Samples from Qdrant:");
    console.log(JSON.stringify(response.points, null, 2));
  } catch (error) {
    console.error("Error reading from Qdrant:", error);
  }
}

main();
