import { AiQueryService } from "./src/services/ai-query.service.ts";
import { IntentService } from "./src/services/intent.service.ts";
import { QueryPlannerService } from "./src/services/query-planner.service.ts";
import { loadSchemaMapping } from "./src/db/schema-mapping.ts";
import { LlmProvider } from "./src/llm/provider.ts";

async function testRobustness() {
  const schema = await loadSchemaMapping();
  const llm = new LlmProvider();
  
  // Custom IntentService with a broken classify to trigger fallback
  const intentService = new IntentService(llm);
  const originalClassify = intentService.classify.bind(intentService);
  intentService.classify = async (tenantId, query) => {
    if (query === "TRIGGER_FAILURE") throw new Error("Simulated LLM Failure");
    return originalClassify(tenantId, query);
  };

  const planner = new QueryPlannerService();
  // ... other dependencies can be mocked or use real ones if base setup works
  
  console.log("--- Scenario 1: 'Tell me about Dr. Raju' (Should be Hybrid) ---");
  const intent1 = { target: 'doctors', operation: 'semantic_lookup', confidence: 1 };
  const plan1 = planner.plan(intent1 as any);
  console.log("Plan 1 strategy:", plan1.strategy);
  console.log("Plan 1 runSql:", plan1.runSql);
  console.log("Plan 1 runVector:", plan1.runVector);

  console.log("\n--- Scenario 2: 'List doctors' (Should be SQL only) ---");
  const intent2 = { target: 'doctors', operation: 'list', confidence: 1 };
  const plan2 = planner.plan(intent2 as any);
  console.log("Plan 2 strategy:", plan2.strategy);
  console.log("Plan 2 runSql:", plan2.runSql);
  console.log("Plan 2 runVector:", plan2.runVector);

  console.log("\n--- Scenario 3: Intent Fallback with 'Find doctor Ravi' ---");
  try {
    const fallback = await intentService.classify("tenant", "Find doctor Ravi");
    console.log("Fallback target:", fallback.intent.target);
    console.log("Fallback provider:", fallback.provider);
  } catch (e) {
    console.error("Fallback failed:", e);
  }

  process.exit(0);
}

testRobustness().catch(console.error);
