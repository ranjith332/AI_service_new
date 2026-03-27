import { env } from "./src/config/env.ts";

async function testLlm() {
  const apiKey = env.NVIDIA_QWEN_API_KEY;
  const baseUrl = env.NVIDIA_QWEN_BASE_URL;
  const model = env.NVIDIA_QWEN_MODEL;

  console.log(`Testing NVIDIA LLM with:`);
  console.log(`Base URL: ${baseUrl}`);
  console.log(`Model: ${model}`);

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: "user", content: "Hi" }
        ],
        max_tokens: 5
      })
    });

    console.log("Status:", response.status);
    const data = await response.json();
    console.log("Response Body:", JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Error during fetch:", error);
  }
}

testLlm();
