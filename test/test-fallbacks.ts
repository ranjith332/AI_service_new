import { IntentService } from "../src/services/intent.service.ts";
import { LlmProvider } from "../src/llm/provider.ts";

// Mock LlmProvider to force fallback logic
const mockLlm = {
  invokeStructured: async () => {
    throw new Error("Simulated LLM failure to trigger fallback");
  }
} as any as LlmProvider;

const intentService = new IntentService(mockLlm);

const testQueries = [
  "How many patients and doctors are there?",
  "Show me Dr. Raju's profile",
  "Search for appointments and patients",
  "I want to book an appointment with Dr. Smith",
  "Count the total number of prescriptions and medicines",
  "Tell me about paracetamol",
  "How many tokens are left for today?",
  "What is the phone number of Dr. Raju?"
];

async function runTests() {
  console.log("--- Fallback Intent Verification ---\n");
  
  for (const query of testQueries) {
    console.log(`Query: "${query}"`);
    try {
      const result = await intentService.classify("tenant-1", query);
      console.log(`Targets: [${result.intent.targets?.join(", ")}]`);
      console.log(`Primary Target: ${result.intent.target}`);
      console.log(`Operation: ${result.intent.operation}`);
      console.log(`Metric: ${result.intent.metric}`);
      console.log(`Summary: ${result.intent.summary}`);
      console.log("-----------------------------------\n");
    } catch (err) {
      console.error(`Error classifying "${query}":`, err);
    }
  }
}

runTests();
