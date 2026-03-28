import { env } from "./src/config/env.ts";
import { writeFile } from "node:fs/promises";

async function listModels() {
  const response = await fetch(`${env.NVIDIA_QWEN_BASE_URL}/models`, {
    headers: {
      "Authorization": `Bearer ${env.NVIDIA_QWEN_API_KEY}`
    }
  });
  const data = await response.json();
  const ids = data.data.map((m: any) => m.id);
  await writeFile("nvidia_models.txt", ids.join("\n"));
  console.log("Saved to nvidia_models.txt");
}

listModels().catch(console.error);
