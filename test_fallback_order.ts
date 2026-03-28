import { LlmProvider } from "./src/llm/provider.ts";
import { z } from "zod";

async function testFallback() {
  const llm = new LlmProvider();
  const schema = z.object({
    result: z.string()
  });

  console.log("Testing Fallback Chain...");
  
  // Note: To truly test OpenAI failure, you'd need an invalid key, 
  // but we can at least verify the order of candidates.
  
  // @ts-ignore - accessing private for testing
  const candidates = llm["getCandidates"](false);
  console.log("Candidate Order:", candidates.map(c => c.name));

  if (candidates[0].name !== "openai") {
    console.error("FAIL: OpenAI should be primary");
  } else {
    console.log("SUCCESS: OpenAI is primary");
  }

  // @ts-ignore
  const fastCandidates = llm["getCandidates"](true);
  console.log("Fast Mode Candidate Order:", fastCandidates.map(c => c.name));
  
  if ((fastCandidates[0].model as any).model.includes("8b")) {
    console.log("SUCCESS: Intent model (8b) is primary in Fast Mode");
  } else {
    console.warn("WARN: Intent model not primary in Fast Mode");
  }
}

testFallback();
