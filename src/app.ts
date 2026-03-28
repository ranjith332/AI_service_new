import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";

import { env } from "./config/env.ts";
import { DatabaseClient } from "./db/client.ts";
import { loadSchemaMapping } from "./db/schema-mapping.ts";
import { LlmProvider } from "./llm/provider.ts";
import { createAiRoute } from "./routes/ai.ts";
import { createBillingRoute } from "./routes/billing.ts";
import { AiQueryService } from "./services/ai-query.service.ts";
import { AuthService } from "./services/auth.service.ts";
import { QueryCacheService } from "./services/cache.service.ts";
import { CashfreeService } from "./services/cashfree.service.ts";
import { DbExecutorService } from "./services/db-executor.service.ts";
import { DynamicSqlPlannerService } from "./services/dynamic-sql-planner.service.ts";
import { IntentService } from "./services/intent.service.ts";
import { QueryPlannerService } from "./services/query-planner.service.ts";
import { ResponseGeneratorService } from "./services/response-generator.service.ts";
import { SchemaDiscoveryService } from "./services/schema-discovery.service.ts";
import { SqlBuilderService } from "./services/sql-builder.service.ts";
import { TokenBillingService } from "./services/token-billing.service.ts";
import { VectorSearchService } from "./services/vector-search.service.ts";
import { SessionService } from "./services/session.service.ts";
import { BookingService } from "./services/booking.service.ts";
import { AppError } from "./utils/errors.ts";
import { logger } from "./utils/logger.ts";
import { InMemoryRateLimiter } from "./utils/rate-limiter.ts";
import { QdrantService } from "./vector/qdrant.ts";

export async function createApp() {
  const schemaMapping = await loadSchemaMapping();
  const db = new DatabaseClient();
  const llm = new LlmProvider();
  const qdrant = new QdrantService();
  const rateLimiter = new InMemoryRateLimiter(env.API_RATE_LIMIT_WINDOW_MS, env.API_RATE_LIMIT_MAX_REQUESTS);
  const authService = new AuthService();
  const cache = env.ENABLE_QUERY_CACHE ? new QueryCacheService(env.CACHE_TTL_SECONDS * 1000) : null;
  const cashfreeService = new CashfreeService();
  const tokenBillingService = new TokenBillingService(db, cashfreeService);
  const schemaDiscoveryService = new SchemaDiscoveryService(db);
  const dynamicSqlPlannerService = new DynamicSqlPlannerService(llm);
  const sessionService = new SessionService();
  const bookingService = new BookingService(db, schemaMapping);

  const aiQueryService = new AiQueryService(
    schemaMapping,
    new IntentService(llm),
    new QueryPlannerService(),
    new SqlBuilderService(),
    schemaDiscoveryService,
    dynamicSqlPlannerService,
    new DbExecutorService(db),
    new VectorSearchService(llm, qdrant),
    new ResponseGeneratorService(llm),
    cache,
    sessionService,
    bookingService
  );

  const app = new Elysia()
    .use(
      cors({
        origin: env.CORS_ORIGIN === "*" ? true : env.CORS_ORIGIN
      })
    )
    .onRequest(({ request }) => {
      logger.info(
        {
          request_id: request.headers.get("x-request-id"),
          method: request.method,
          path: new URL(request.url).pathname
        },
        "Incoming request"
      );
    })
    .get("/health", async () => {
      await qdrant.healthcheck();
      return {
        status: "ok"
      };
    })
    .use(
      createAiRoute({
        aiQueryService,
        authService,
        rateLimiter
      })
    )
    .use(
      createBillingRoute({
        authService,
        rateLimiter,
        tokenBillingService
      })
    )
    .onError(({ error, code, set, request }) => {
      const requestId = request.headers.get("x-request-id");

      if (error instanceof AppError) {
        set.status = error.statusCode;
        logger.warn(
          {
            request_id: requestId,
            code: error.code,
            details: error.details
          },
          error.message
        );

        return {
          error: error.code,
          message: error.message
        };
      }

      if (code === "VALIDATION") {
        set.status = 400;
        return {
          error: "validation_error",
          message: "Invalid request payload."
        };
      }

      logger.error(
        {
          request_id: requestId,
          error
        },
        "Unhandled application error"
      );

      set.status = 500;
      return {
        error: "internal_error",
        message: "An unexpected error occurred."
      };
    });

  return {
    app,
    db
  };
}
