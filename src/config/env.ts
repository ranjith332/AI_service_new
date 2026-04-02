import { z } from "zod";
import "dotenv/config";

const envSchema = z.object({
  PORT: z.string().default("3000"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  
  // Database
  DATABASE_URL: z.string().optional(),
  DB_HOST: z.string().optional(),
  DB_PORT: z.string().default("3306"),
  DB_USER: z.string().optional(),
  DB_PASSWORD: z.string().optional(),
  DB_NAME: z.string().optional(),
  
  // LLM Providers (OpenAI)
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  
  // LLM Providers (NVIDIA NIM)
  NVIDIA_QWEN_API_KEY: z.string().optional(),
  NVIDIA_QWEN_BASE_URL: z.string().default("https://integrate.api.nvidia.com/v1"),
  NVIDIA_QWEN_MODEL: z.string().default("meta/llama-3.1-8b-instruct"),
  
  // Vector DB (Qdrant)
  QDRANT_URL: z.string().optional(),
  QDRANT_API_KEY: z.string().optional(),
  QDRANT_COLLECTION: z.string().default("doctor_healix_healthcare"),
  QDRANT_VECTOR_NAME: z.string().optional(),
  
  // Embedding Models
  NVIDIA_EMBEDDING_MODEL: z.string().default("nvidia/nv-embedqa-e5-v5"),
  OPENAI_EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
  
  // App Config
  DEFAULT_TENANT_ID: z.string().default("default"),
  JWT_SECRET: z.string().default("secret"),
  LLM_TIMEOUT_MS: z.string().default("60000").transform(Number),
  INGESTION_STATE_PATH: z.string().default("storage/ingestion-state.json"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:", parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;
