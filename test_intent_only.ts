import { IntentService } from "./src/services/intent.service.ts";
import { LlmProvider } from "./src/llm/provider.ts";

async function testIntent() {
  const llm = new LlmProvider();
  const service = new IntentService(llm);
  
  const query = "what are the tokens available for doctor Raju Boy for today";
  console.log(`Testing Intent Classification for '${query}'...`);
  try {
    const result = await service.classify("bc2428a0-604b-45c9-a04b-01e390ccace8", query);
    console.log("SUCCESS:", JSON.stringify(result.intent, null, 2));
  } catch (err: any) {
    console.error("FAILED with Error:", err.message);
    if (err.stack) console.error(err.stack);
  }
}

testIntent();
