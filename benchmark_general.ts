import { performance } from "perf_hooks";

async function benchmark() {
    const start = performance.now();
    try {
        const response = await fetch("http://localhost:3000/ai/query", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                user_query: "What is 5 + 5?",
                tenant_id: "bc2428a0-604b-45c9-a04b-01e390ccace8"
            })
        });
        const data = await response.json();
        const end = performance.now();
        console.log(`Query took: ${((end - start) / 1000).toFixed(2)}s`);
        console.log("Answer:", data.answer);
    } catch (error) {
        console.error("Benchmark failed:", error.message);
    }
}

benchmark();
