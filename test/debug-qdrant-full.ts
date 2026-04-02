import { QdrantClient } from "@qdrant/js-client-rest";
import { env } from "../src/config/env.ts";

async function main() {
    const client = new QdrantClient({
        url: env.QDRANT_URL,
        apiKey: env.QDRANT_API_KEY,
    });

    const collectionName = env.QDRANT_COLLECTION;
    console.log(`Inspecting collection: ${collectionName}`);
    
    try {
        const info = await client.getCollection(collectionName);
        console.log("COLLECTION_INFO_START");
        console.log(JSON.stringify(info, null, 2));
        console.log("COLLECTION_INFO_END");
    } catch (e: any) {
        console.error("Error:", e.message);
    }
}

main();
