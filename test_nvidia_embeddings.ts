import { env } from "./src/config/env.ts";

async function testEmbeddings() {
  const apiKey = env.NVIDIA_QWEN_API_KEY;
  const baseUrl = env.NVIDIA_QWEN_BASE_URL;
  const model = env.NVIDIA_EMBEDDING_MODEL;

  console.log(`Testing NVIDIA Embeddings with:`);
  console.log(`Base URL: ${baseUrl}`);
  console.log(`Model: ${model}`);

  try {
    const response = await fetch(`${baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        input: ["Hello world"],
        model: model,
        input_type: "query",
        encoding_format: "float",
        truncate: "NONE"
      })
    });

    console.log("Status:", response.status);
    const data = await response.json();
    console.log("Response Body:", JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Error during fetch:", error);
  }
}

testEmbeddings();
