import { QdrantClient } from "@qdrant/js-client-rest";
import { env } from "../config/env.ts";
import { logger } from "../utils/logger.ts";

export class VectorSearchService {
  private client: QdrantClient;

  constructor() {
    this.client = new QdrantClient({
      url: env.QDRANT_URL,
      apiKey: env.QDRANT_API_KEY,
    });
  }

  private async generateEmbedding(text: string): Promise<number[]> {
    const models = [env.NVIDIA_EMBEDDING_MODEL, "nvidia/llama-3.2-nv-embedqa-1b-v2"];
    let lastError = "";

    for (const model of models) {
        try {
            const response = await fetch(`${env.NVIDIA_QWEN_BASE_URL}/embeddings`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${env.NVIDIA_QWEN_API_KEY}`
                },
                body: JSON.stringify({
                    input: [text],
                    model: model,
                    encoding_format: "float",
                    input_type: "query"
                })
            });

            if (response.ok) {
                const data = await response.json() as any;
                return data.data[0].embedding;
            }

            const errorText = await response.text();
            lastError = `Model ${model} (HTTP ${response.status}): ${errorText}`;
            logger.warn({ model, status: response.status, error: errorText }, "Embedding attempt failed");
        } catch (e: any) {
            lastError = `Exception: ${e.message}`;
            logger.error({ model, exception: e.message }, "Embedding fetch threw exception");
        }
    }
    throw new Error(`All NVIDIA Embedding attempts failed. Last error: ${lastError}`);
  }

  async search(tenantId: string, query: string, limit: number = 5) {
    logger.info({ tenantId, query }, "Vector search started");
    try {
      const embedding = await this.generateEmbedding(query);
      const collectionName = env.QDRANT_COLLECTION;

      const vectorData = env.QDRANT_VECTOR_NAME
        ? { name: env.QDRANT_VECTOR_NAME, vector: embedding }
        : embedding;

      const results = await this.client.search(collectionName, {
        vector: vectorData as any,
        limit,
        filter: {
          must: [{ key: "tenant_id", match: { value: tenantId } }]
        }
      });

      return results.map(r => r.payload);
    } catch (error: any) {
      logger.error({ error: error.message }, "Vector search failed");
      return [];
    }
  }
}
