
import { env } from "./src/config/env.ts";

async function testQuery() {
  console.log("Testing /ai/query...");
  try {
    const response = await fetch("http://localhost:3000/ai/query", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        tenant_id: "hospital_001",
        user_query: "Hello"
      })
    });

    console.log("Status:", response.status);
    console.log("Headers:", JSON.stringify(Object.fromEntries(response.headers.entries()), null, 2));
    const text = await response.text();
    console.log("Body:", text);
  } catch (error) {
    console.error("Error:", error);
  }
}

testQuery();
