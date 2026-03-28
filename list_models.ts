import { env } from "./src/config/env.ts";

async function listModels() {
  const response = await fetch(`${env.NVIDIA_QWEN_BASE_URL}/models`, {
    headers: {
      "Authorization": `Bearer ${env.NVIDIA_QWEN_API_KEY}`
    }
  });
  const data = await response.json();
  const ids = data.data.map((m: any) => m.id);
  console.log("Top 20 models:");
  console.log(ids.slice(0, 20).join("\n"));
}

listModels().catch(console.error);
