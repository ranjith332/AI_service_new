import { createApp } from "./src/app.ts";

async function verify() {
  const { app } = await createApp();
  const tenantId = "00cf2631-d9cb-48b7-ae55-47f75754500d";

  console.log("🚀 Testing Grammar Resilience & Search Fallback...");

  // Test 1: Typos in Doctor Name
  console.log("\n--- Test 1: Typos ('Who is Dr. Romesh?') ---");
  const res1 = await app.handle(new Request("http://localhost/ai/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tenant_id: tenantId,
      user_query: "Who is Dr. Romesh?"
    })
  }));
  const data1: any = await res1.json();
  console.log("Status:", res1.status);
  console.log("AI Answer:", data1.answer);
  console.log("Strategy:", data1.meta?.strategy);

  // Test 2: Extreme Slang/Poor Grammar
  console.log("\n--- Test 2: Poor Grammar ('find me doc raju boy bio pls') ---");
  const res2 = await app.handle(new Request("http://localhost/ai/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tenant_id: tenantId,
      user_query: "find me doc raju boy bio pls"
    })
  }));
  const data2: any = await res2.json();
  console.log("Status:", res2.status);
  console.log("AI Answer:", data2.answer);
  
  process.exit(0);
}

verify().catch(e => {
  console.error(e);
  process.exit(1);
});
