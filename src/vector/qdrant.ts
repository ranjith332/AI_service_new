import { QdrantClient } from "@qdrant/js-client-rest";

import { env } from "../config/env.ts";
import { AppError } from "../utils/errors.ts";
import { logger } from "../utils/logger.ts";
import { withRetry } from "../utils/retry.ts";

export interface VectorPointPayload {
  [key: string]: unknown;
  tenant_id: string;
  table_name: string;
  record_id: string;
  patient_id?: string | null;
  doctor_id?: string | null;
  text: string;
  title: string;
  updated_at?: string | null;
  source?: string | null;
}

export interface UpsertVectorPoint {
  id: string;
  vector: number[];
  payload: VectorPointPayload;
}

export class QdrantService {
  private readonly client = new QdrantClient({
    url: env.QDRANT_URL,
    apiKey: env.QDRANT_API_KEY
  });

  private initialized = false;

  async ensureCollection(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const collections = await this.client.getCollections();
    const exists = collections.collections.some((collection) => collection.name === env.QDRANT_COLLECTION);

    if (!exists) {
      await this.client.createCollection(env.QDRANT_COLLECTION, {
        vectors: {
          size: env.VECTOR_SIZE,
          distance: "Cosine"
        },
        on_disk_payload: true
      });
    }

    await Promise.allSettled([
      this.client.createPayloadIndex(env.QDRANT_COLLECTION, {
        field_name: "tenant_id",
        field_schema: "keyword"
      }),
      this.client.createPayloadIndex(env.QDRANT_COLLECTION, {
        field_name: "table_name",
        field_schema: "keyword"
      }),
      this.client.createPayloadIndex(env.QDRANT_COLLECTION, {
        field_name: "patient_id",
        field_schema: "keyword"
      })
    ]);

    this.initialized = true;
  }

  async upsert(points: UpsertVectorPoint[]): Promise<void> {
    if (!points.length) {
      return;
    }

    await this.ensureCollection();

    const firstPoint = points[0];
    if (!firstPoint) return;

    logger.debug(
      {
        batchSize: points.length,
        vectorSize: firstPoint.vector.length,
        expectedSize: env.VECTOR_SIZE,
        sampleId: firstPoint.id
      },
      "Preparing Qdrant upsert"
    );

    if (firstPoint.vector.length !== env.VECTOR_SIZE) {
      throw new AppError(
        `Vector size mismatch. Model returned ${firstPoint.vector.length}, but collection expects ${env.VECTOR_SIZE}.`,
        500,
        "vector_size_mismatch"
      );
    }

    try {
      await withRetry(
        () =>
          this.client.upsert(env.QDRANT_COLLECTION, {
            wait: true,
            points
          }),
        {
          attempts: 3
        }
      );
      logger.info({ count: points.length }, "Successfully upserted points to Qdrant");
    } catch (error: any) {
      logger.error(
        {
          error: error.message,
          stack: error.stack,
          points: points.map(p => ({ id: p.id, vectorSize: p.vector.length }))
        },
        "Qdrant upsert failed"
      );
      throw new AppError(`Qdrant upsert failed: ${error.message}`, 500, "qdrant_upsert_failed", error);
    }
  }

  async search(params: {
    tenantId: string;
    embedding: number[];
    tableNames?: string[];
    limit?: number;
  }): Promise<Array<{ id: string | number; score: number; payload: VectorPointPayload | null | undefined }>> {
    await this.ensureCollection();

    const filter =
      (params.tableNames?.length ?? 0) > 1
        ? {
            must: [
              {
                key: "tenant_id",
                match: { value: params.tenantId }
              }
            ],
            should: params.tableNames!.map((tableName) => ({
              key: "table_name",
              match: {
                value: tableName
              }
            }))
          }
        : {
            must: [
              {
                key: "tenant_id",
                match: { value: params.tenantId }
              },
              ...((params.tableNames ?? []).map((tableName) => ({
                key: "table_name",
                match: {
                  value: tableName
                }
              })) as Array<Record<string, unknown>>)
            ]
          };

    const result = await withRetry(
      () =>
        this.client.search(env.QDRANT_COLLECTION, {
          vector: params.embedding,
          limit: params.limit ?? env.VECTOR_RESULT_LIMIT,
          filter,
          with_payload: true
        }),
      {
        attempts: 3
      }
    );

    return result.map((item) => ({
      id: item.id,
      score: item.score,
      payload: item.payload as VectorPointPayload | null | undefined
    }));
  }

  async healthcheck(): Promise<void> {
    try {
      await this.client.getCollections();
    } catch (error) {
      throw new AppError("Unable to connect to Qdrant.", 500, "qdrant_unavailable", error);
    }
  }
}
