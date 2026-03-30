import { ResponseGeneratorService } from "./src/services/response-generator.service.ts";

async function testLlmFallback() {
    // 1. Setup a manual mock of LlmProvider that ALWAYS fails with 500
    const mockLlm: any = {
        invokeText: async () => {
            throw new Error("500 Internal Server Error: Something went wrong with the NVIDIA provider.");
        }
    };

    const generator = new ResponseGeneratorService(mockLlm);

    const params: any = {
        tenantId: "test-tenant",
        userQuery: "tell me about raju boy",
        intent: { summary: "raju boy", target: "doctors" },
        sqlRows: [
            { id: 5, first_name: "Raju", last_name: "Boy", designation: "General Surgeon", specialization: "Surgery" }
        ],
        vectorRows: [],
        timeZone: "UTC"
    };

    console.log("--- TEST: Simulating LLM 500 Error for Doctor Search ---");
    const result = await generator.generate(params);

    console.log("\n[OVERALL RESULT]");
    console.log("Provider:", result.provider);
    console.log("Answer Contains Retrieval Message:", result.answer.includes("retrieved the following doctors record"));
    console.log("Answer Contains Doctor Name:", result.answer.includes("Raju"));
    console.log("Answer Contains Note:", result.answer.includes("Note: This is a direct record summary"));

    if (result.answer.includes("Raju") && result.answer.includes("temporarily unavailable")) {
        console.log("\nSUCCESS: Fallback logic correctly triggered and data was preserved!");
    } else {
        console.log("\nFAILURE: Fallback logic did not work as expected.");
    }
}

testLlmFallback().catch(console.error);
