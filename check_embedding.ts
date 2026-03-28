import { LlmProvider } from "./src/llm/provider.ts";

async function check() {
  const llm = new LlmProvider();
  if (!llm.embeddings) {
    console.error("Embeddings not configured");
    return;
  }
  const text = "Hello world";
  const vector = await llm.embeddings.embedQuery(text);
  console.log("Vector length:", vector.length);
  console.log("First 3 values:", vector.slice(0, 3));
}

check();
