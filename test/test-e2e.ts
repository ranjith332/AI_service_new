async function testQuery(query: string) {
  console.log(`Testing query: "${query}"`);
  
  const response = await fetch("http://localhost:3000/ai/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tenant_id: "tenant-1",
      user_query: query
    })
  });
  
  if (!response.ok) {
    const text = await response.text();
    console.error(`Error: ${response.status} ${response.statusText}\n${text}`);
    return;
  }
  
  const data = await response.json();
  console.log("\n--- Full Result ---");
  console.log(`Answer: ${data.answer}`);
  console.log(`Strategy: ${data.meta?.strategy}`);
  console.log(`Operation: ${data.intent?.operation}`);
  console.log(`SQL Mode: ${data.meta?.sql_mode}`);
  console.log(`SQL Rows: ${data.data?.sql?.row_count}`);
  console.log("-------------------\n");
}

async function runAll() {
  await testQuery("How many patients are there?");
  await testQuery("how many patients and doctors are there?");
  await testQuery("today completed appointments count");
  await testQuery("How many doctors have >5 years experience?");
}

runAll().catch(console.error);
