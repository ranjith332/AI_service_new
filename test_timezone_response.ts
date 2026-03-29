import { ResponseGeneratorService } from "./src/services/response-generator.service.ts";
import { LlmProvider } from "./src/llm/provider.ts";

async function test() {
  const llm = new LlmProvider();
  const generator = new ResponseGeneratorService(llm);
  
  const timeZone = "Asia/Kolkata";
  const today = new Date().toLocaleDateString('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  
  console.log(`Current Local Date (IST): ${today}`);

  const params = {
    tenantId: "bc2428a0-604b-45c9-a04b-01e390ccace8",
    userQuery: "list doctor Raju Boy booked appointments in today",
    intent: {
      summary: "List today's appointments for Raju Boy",
      operation: "list",
      target: "appointments",
      doctorName: "Raju Boy",
      timeRange: { preset: "today" }
    } as any,
    sqlRows: [
      {
        appointment_id: 144,
        scheduled_at: "2026-03-28T18:30:00.000Z", // This is 2026-03-29 00:00:00 IST
        status: 1,
        patient_name: "Suriya D", // Now should be populated
        doctor_name: "raju boy"
      }
    ],
    vectorRows: [],
    timeZone: timeZone
  };

  console.log("--- Testing Response Generation with Timezone Awareness ---");
  const result = await generator.generate(params);
  
  console.log("\nAI Answer:");
  console.log(result.answer);

  if (result.answer.toLowerCase().includes("today") || result.answer.includes("March 29")) {
    console.log("\n✅ Timezone Awareness Test PASSED!");
  } else {
    console.log("\n❌ Timezone Awareness Test FAILED (AI might still think it's March 28).");
  }

  if (result.answer.includes("Suriya")) {
    console.log("\n✅ Patient Name Inclusion Test PASSED!");
  } else {
    console.log("\n❌ Patient Name Inclusion Test FAILED!");
  }

  process.exit(0);
}

test().catch(console.error);
