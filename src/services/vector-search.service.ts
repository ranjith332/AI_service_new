import type { LlmProvider } from "../llm/provider.ts";
import type { QdrantService } from "../vector/qdrant.ts";
import { AppError } from "../utils/errors.ts";

export class VectorSearchService {
  constructor(
    private readonly llm: LlmProvider,
    private readonly qdrant: QdrantService
  ) {}

  async search(params: { tenantId: string; query: string; tableNames?: string[]; limit?: number }) {
    if (!this.llm.embeddings) {
      throw new AppError("OpenAI embeddings are required for vector search.", 500, "embeddings_not_configured");
    }

    const embedding = await this.llm.embeddings.embedQuery(params.query);
    return this.qdrant.search({
      tenantId: params.tenantId,
      embedding,
      tableNames: params.tableNames,
      limit: params.limit
    });
  }
}
