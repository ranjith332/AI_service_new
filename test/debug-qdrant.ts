import { QdrantClient } from "@qdrant/js-client-rest";
import { env } from "../src/config/env.ts";

async function main() {
    console.log("Checking Qdrant connection...");
    console.log("URL:", env.QDRANT_URL);
    
    if (!env.QDRANT_URL || !env.QDRANT_API_KEY) {
        console.error("QDRANT_URL or QDRANT_API_KEY is missing in .env");
        process.exit(1);
    }

    const client = new QdrantClient({
        url: env.QDRANT_URL,
        apiKey: env.QDRANT_API_KEY,
    });

    try {
        const collections = await client.getCollections();
        console.log("Collections Found:", collections.collections.map(c => c.name));
        
        const collectionName = env.QDRANT_COLLECTION;
        console.log(`Checking collection: ${collectionName}`);
        
        try {
            const info = await client.getCollection(collectionName);
            console.log("Collection Info:", JSON.stringify(info, null, 2));
        } catch (e: any) {
            console.warn(`Collection ${collectionName} does not exist or error:`, e.message);
        }
    } catch (e: any) {
        console.error("Failed to connect to Qdrant:", e.message);
    }
}

main();
