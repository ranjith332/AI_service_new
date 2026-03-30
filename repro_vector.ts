import { QdrantService } from './src/vector/qdrant.ts';
import { LlmProvider } from './src/llm/provider.ts';
import { env } from './src/config/env.ts';

const qdrant = new QdrantService();
const llm = new LlmProvider();

async function test() {
    if (!llm.embeddings) {
        console.error("No embeddings configured");
        process.exit(1);
    }
    const embedding = await llm.embeddings.embedQuery('Raju boy');
    const res = await qdrant.search({
        tenantId: 'bc2428a0-604b-45c9-a04b-01e390ccace8',
        embedding,
        tableNames: ['doctors']
    });
    console.log(JSON.stringify(res, null, 2));
    process.exit(0);
}

test().catch(err => {
    console.error(err);
    process.exit(1);
});
