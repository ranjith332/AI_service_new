import { IntentService } from './src/services/intent.service.ts';
import { LlmProvider } from './src/llm/provider.ts';

const llm = new LlmProvider();
const intentService = new IntentService(llm);

async function test() {
    const tenantId = 'bc2428a0-604b-45c9-a04b-01e390ccace8';
    const query = 'list 20 Raju boy';
    
    const result = await intentService.classify(tenantId, query);
    console.log(JSON.stringify(result.intent, null, 2));
    process.exit(0);
}

test().catch(err => {
    console.error(err);
    process.exit(1);
});
