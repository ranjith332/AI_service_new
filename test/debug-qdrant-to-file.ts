import { QdrantClient } from "@qdrant/js-client-rest";
import { env } from "../src/config/env.ts";
import * as fs from "fs";

async function main() {
    const client = new QdrantClient({
        url: env.QDRANT_URL,
        apiKey: env.QDRANT_API_KEY,
    });

    const collectionName = env.QDRANT_COLLECTION;
    console.log(`Inspecting collection: ${collectionName}`);
    
    try {
        const info = await client.getCollection(collectionName);
        fs.writeFileSync("qdrant_info.json", JSON.stringify(info, null, 2));
        console.log("Written collection info to qdrant_info.json");
    } catch (e: any) {
        console.error("Error:", e.message);
    }
}

main();
