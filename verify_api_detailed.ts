const API_URL = "http://localhost:3000/ai/query";
const TENANT_ID = "bc2428a0-604b-45c9-a04b-01e390ccace8";

async function testQuery(query: string, label: string) {
    console.log(`\n--- [TEST: ${label}] ---`);
    console.log(`Query: "${query}"`);
    
    const start = Date.now();
    try {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                user_query: query,
                tenant_id: TENANT_ID
            })
        });
        const duration = Date.now() - start;
        const data = await response.json() as any;
        
        if (!response.ok) {
            console.log(`Status: FAILED`);
            console.log(`Latency: ${duration}ms`);
            console.log(`Error: ${response.status} - ${JSON.stringify(data)}`);
            return false;
        }

        console.log(`Status: SUCCESS`);
        console.log(`Latency: ${duration}ms`);
        console.log(`Answer Summary: ${data.answer.substring(0, 100)}...`);
        
        // Detailed checks for certain queries
        if (label === "Real Booking") {
            if (data.answer.includes("booked") || data.answer.includes("appointment") || data.answer.includes("successfully")) {
                console.log("✅ Booking confirmed in response");
            } else {
                console.log("⚠️ Booking confirmation not found in text");
            }
        }
        
        if (label === "Token Availability") {
            const hasDetailedTokens = data.meta?.strategy === "sql" || 
                                     data.answer.includes("tokens") || 
                                     data.answer.includes("available");
            if (hasDetailedTokens) {
                console.log("✅ Availability data retrieved");
            } else {
                console.log("⚠️ Unexpected availability response");
            }
        }
        
        return true;
    } catch (err: any) {
        const duration = Date.now() - start;
        console.log(`Status: FAILED`);
        console.log(`Latency: ${duration}ms`);
        console.log(`Error: ${err.message}`);
        return false;
    }
}

async function runAllTests() {
    const tests = [
        ["Hi there", "Hospital General"],
        ["List all doctors", "Doctor Details"],
        ["Book an appointment for patient Raju with doctor Raju Boy for tomorrow morning", "Real Booking"],
        ["What are the tokens available for doctor Raju Boy for today?", "Token Availability"],
        ["Show my prescriptions", "Mapped Metadata"],
        ["Doctor with the most appointments", "Analytical Query"],
        ["Who is the specialist here?", "Specific Doctor"]
    ];

    let successCount = 0;
    for (const [query, label] of tests) {
        const success = await testQuery(query, label);
        if (success) successCount++;
        // Small delay to prevent rate limits
        await new Promise(r => setTimeout(r, 2000));
    }

    console.log(`\n--- FINAL SUMMARY ---`);
    console.log(`Tests Passed: ${successCount}/${tests.length}`);
}

runAllTests();
