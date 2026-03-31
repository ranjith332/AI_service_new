import { LlmProvider } from "./src/llm/provider.ts";
import { z } from "zod";

async function testLlm() {
  const llm = new LlmProvider();
  console.log("Testing LlmProvider.invokeText...");
  try {
    const res = await llm.invokeText({ system: "You are a helpful assistant.", user: "Say 'Hello'" });
    console.log("SUCCESS invokeText:", res);
  } catch (e: any) {
    console.error("FAILED invokeText:", e.message);
  }

  console.log("\nTesting LlmProvider.invokeStructured...");
  try {
    const schema = z.object({ hello: z.string() });
    const res = await llm.invokeStructured(schema, { 
      system: "You are a helpful assistant.", 
      user: "Return hello world JSON.",
      schemaName: "test"
    });
    console.log("SUCCESS invokeStructured:", res);
  } catch (e: any) {
    console.error("FAILED invokeStructured:", e.message);
  }
}

testLlm().catch(console.error);
