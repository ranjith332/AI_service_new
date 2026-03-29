import { LlmProvider } from './src/llm/provider.ts';
import { z } from 'zod';

const llm = new LlmProvider();
try {
    console.log("Testing Intent (OpenAI)...");
    const res = await llm.invokeText({
        system: "You are a test assistant.",
        user: "Say 'Hello OpenAI'"
    });
    console.log("Success:", JSON.stringify(res, null, 2));
} catch (e: any) {
    console.error("OpenAI Test Failed with Error:", e.name, e.message);
    if (e.cause) console.error("Cause:", e.cause);
}
