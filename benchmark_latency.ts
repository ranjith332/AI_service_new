import { performance } from "perf_hooks";
import axios from "axios";

async function benchmark() {
    const start = performance.now();
    try {
        const response = await fetch("http://localhost:3000/ai/query", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                user_query: "Who is Dr. Raju Boy?",
                tenant_id: "bc2428a0-604b-45c9-a04b-01e390ccace8"
            })
        });
        const data = await response.json();
        const end = performance.now();
        console.log(`Query took: ${((end - start) / 1000).toFixed(2)}s`);
        console.log("Provider used:", data.meta.provider);
        console.log("Answer:", data.answer);
    } catch (error) {
        console.error("Benchmark failed:", error.message);
    }
}

benchmark();
