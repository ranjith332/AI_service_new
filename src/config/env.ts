import { config as loadDotEnv } from "dotenv";
import { z } from "zod";

loadDotEnv();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  SERVICE_NAME: z.string().min(1).default("doctor-healix-ai-service"),
  APP_TIMEZONE: z.string().min(1).default("UTC"),
  CORS_ORIGIN: z.string().min(1).default("*"),
  DB_CLIENT: z.literal("mysql").default("mysql"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DB_POOL_MIN: z.coerce.number().int().min(1).default(1),
  DB_POOL_MAX: z.coerce.number().int().min(1).default(10),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().min(1).default("gpt-4.1-mini"),
  OPENAI_EMBEDDING_MODEL: z.string().min(1).default("text-embedding-3-large"),
  NVIDIA_QWEN_API_KEY: z.string().optional(),
  NVIDIA_QWEN_BASE_URL: z.string().url().default("https://integrate.api.nvidia.com/v1"),
  NVIDIA_QWEN_MODEL: z.string().optional(),
  NVIDIA_INTENT_MODEL: z.string().optional(),
  NVIDIA_EMBEDDING_MODEL: z.string().optional(),
  LLM_TIMEOUT_MS: z.coerce.number().int().min(1).default(30000),
  QDRANT_URL: z.string().min(1, "QDRANT_URL is required"),
  QDRANT_API_KEY: z.string().optional(),
  QDRANT_COLLECTION: z.string().min(1).default("doctor_healix_healthcare"),
  QDRANT_VECTOR_NAME: z.string().optional(),
  VECTOR_SIZE: z.coerce.number().int().positive().default(3072),
  VECTOR_RESULT_LIMIT: z.coerce.number().int().positive().default(5),
  ENABLE_QUERY_CACHE: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(60),
  API_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  API_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(30),
  AUTH_REQUIRED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  CASHFREE_APP_ID: z.string().optional(),
  CASHFREE_SECRET_KEY: z.string().optional(),
  CASHFREE_ENV: z.enum(["sandbox", "production"]).default("sandbox"),
  CASHFREE_API_VERSION: z.string().min(1).default("2025-01-01"),
  CASHFREE_RETURN_URL: z.string().url().optional(),
  CASHFREE_NOTIFY_URL: z.string().url().optional(),
  SCHEMA_MAPPING_PATH: z.string().min(1).default("./config/schema-mapping.local.json"),
  INGESTION_STATE_PATH: z.string().min(1).default("./config/ingestion-state.local.json"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info")
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const formatted = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("\n");
  throw new Error(`Invalid environment configuration:\n${formatted}`);
}

export const env = parsed.data;
export type AppEnv = typeof env;
