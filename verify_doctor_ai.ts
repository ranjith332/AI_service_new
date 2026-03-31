import { createApp } from "./src/app.ts";

async function verify() {
  const app = await createApp();
  const tenantId = "00cf2631-d9cb-48b7-ae55-47f75754500d";
  
  console.log("--- Test 1: Doctor Bio ---");
  const bio = await app.aiQueryService.execute({
    tenant_id: tenantId,
    user_query: "Who is Dr. Ramesh Kumar? Tell me about his experience."
  });
  console.log("Bio Answer:", (bio as any).answer);

  console.log("\n--- Test 2: Availability ---");
  const avail = await app.aiQueryService.execute({
    tenant_id: tenantId,
    user_query: "What slots are available for Dr. Ramesh today?"
  });
  console.log("Avail Answer:", (avail as any).answer);

  console.log("\n--- Test 3: Booking ---");
  const book = await app.aiQueryService.execute({
    tenant_id: tenantId,
    user_query: "Book an appointment for Amit Sharma in the morning session with Dr. Ramesh Kumar today",
    session_id: (bio as any).session_id
  });
  console.log("Book Answer:", (book as any).answer);
  
  process.exit(0);
}

verify().catch(e => {
  console.error("Verification failed:", e);
  process.exit(1);
});
