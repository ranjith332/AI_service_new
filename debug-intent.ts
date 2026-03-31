import { IntentService } from "./src/services/intent.service.ts";
import { LlmProvider } from "./src/llm/provider.ts";

async function main() {
    const llm = new LlmProvider();
    const intentService = new IntentService(llm);
    
    const query = "today completed appointments count";
    console.log(`Query: ${query}`);
    
    const result = await intentService.classify("tenant-1", query);
    console.log("Intent Result:");
    console.log(JSON.stringify(result, null, 2));
}

main().catch(console.error);
