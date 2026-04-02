import { VectorSearchService } from "../src/services/vector-search.service.ts";
import { logger } from "../src/utils/logger.ts";

async function main() {
    const vectorService = new VectorSearchService();
    const testQueries = [
        "Tell me about Dr. Ravi",
        "Who is Dr. Raju Boy?",
        "What is the specialty of Dr. Ravi?",
        "Explain cardiovascular research"
    ];

    const tenantId = "default"; // Change this if you have a specific tenant

    console.log(`Starting Semantic Search test for tenant: ${tenantId}\n`);

    for (const query of testQueries) {
        console.log(`Testing Query: "${query}"`);
        try {
            const results = await vectorService.search(tenantId, query, 3);
            
            if (results && results.length > 0) {
                console.log(`Found ${results.length} results:`);
                results.forEach((payload: any, index: number) => {
                    console.log(`  [${index + 1}] Target: ${payload.table_name || 'unknown'}`);
                    console.log(`      Title: ${payload.title || 'N/A'}`);
                    console.log(`      Text: ${payload.text?.substring(0, 100)}...`);
                    console.log(`      ID: ${payload.record_id || payload.id}`);
                });
            } else {
                console.warn("  No results found for this query.");
            }
        } catch (error: any) {
            console.error(`  Error searching for "${query}":`, error.message);
        }
        console.log("----------------------------------\n");
    }
}

main().catch(error => {
    console.error("Test process crashed:", error);
});
