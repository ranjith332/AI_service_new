import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { logger } from "./utils/logger.ts";
import { env } from "./config/env.ts";
import { AiQueryService } from "./services/ai-query.service.ts";
import { LlmProvider } from "./llm/provider.ts";
import { ChatSessionService } from "./services/chat-session.service.ts";
import { DatabaseClient } from "./db/client.ts";

export const startServer = async () => {
  const db = new DatabaseClient();
  const llm = new LlmProvider();
  const chatSession = new ChatSessionService();
  const aiQuery = new AiQueryService(llm, db, chatSession);

  const app = new Elysia()
    .use(cors())
    .post("/ai/query", async ({ body }: any) => {
      // Support multiple key formats for maximum compatibility
      const query = body.query || body.user_query || body.q;
      const tenantId = body.tenantId || body.tenant_id || "default";
      const sessionId = body.sessionId || body.session_id;

      if (!query) {
        return {
          success: false,
          error: "Query is required. Please provide 'query' or 'user_query' in the request body.",
        };
      }

      try {
        const result = await aiQuery.handle(query, tenantId, sessionId);
        const isAggregate = result.intent.operation === "aggregate";
        const sqlCount = result.results.sql.length > 0 ? (isAggregate ? (result.results.sql[0].count ?? result.results.sql[0]['COUNT(*)'] ?? 0) : result.results.sql.length) : 0;

        return {
          success: true,
          answer: result.response,
          meta: {
            intent: result.intent,
            plan: result.plan,
            resultsCount: sqlCount
          }
        };
      } catch (error: any) {
        logger.error({ error: error.message }, "AI Query failed");
        return {
          success: false,
          error: error.message || "An unexpected error occurred",
        };
      }
    })
    .get("/health", () => ({ status: "ok" }))
    .listen(env.PORT);

  logger.info(`🚀 AI Service running on port ${env.PORT}`);
  
  // Also start a wrapper to handle top-level execution if run directly
  return { app };
};

// AUTO-START if run directly with Bun
if (import.meta.main || process.argv[1]?.includes('index.ts')) {
   startServer().catch(err => {
     console.error("Failed to start server:", err);
     process.exit(1);
   });
}
