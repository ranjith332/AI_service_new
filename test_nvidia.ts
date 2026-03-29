import { LlmProvider } from "./src/llm/provider.ts";
import { env } from "./src/config/env.ts";

async function testProvider() {
  console.log("Testing NVIDIA NIM Connection...");
  console.log("Model:", env.NVIDIA_QWEN_MODEL);
  console.log("Base URL:", env.NVIDIA_QWEN_BASE_URL);

  const llm = new LlmProvider();
  try {
    const result = await llm.invokeText({
      system: "You are a helpful assistant.",
      user: "Hello, reply with 'OK' if you see this."
    });
    console.log("SUCCESS:", result.text);
  } catch (err: any) {
    console.error("FAILED with Error:", err.message);
    if (err.stack) console.error(err.stack);
  }
}

testProvider();
