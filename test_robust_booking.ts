async function testRobustBooking() {
    try {
        console.log("Testing lookup-style booking query...");
        const response = await fetch("http://localhost:3000/ai/query", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                user_query: "What is Dr. Raju Boy's schedule for tomorrow? I want to book for Ravi Kumar.",
                tenant_id: "bc2428a0-604b-45c9-a04b-01e390ccace8"
            })
        });
        const data = await response.json();
        console.log("Answer:", data.answer);
        console.log("Strategy:", data.meta.strategy);
    } catch (error) {
        console.error("Test failed:", error.message);
    }
}

testRobustBooking();
