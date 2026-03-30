import { randomUUID } from "node:crypto";

import { Elysia, t } from "elysia";

import type { AiQueryService } from "../services/ai-query.service.ts";
import type { AuthService } from "../services/auth.service.ts";
import type { InMemoryRateLimiter } from "../utils/rate-limiter.ts";
import { ValidationError } from "../utils/errors.ts";
import type { ChatSessionService } from "../services/chat-session.service.ts";
import type { DatabaseClient } from "../db/client.ts";

import { SqlChatMessageHistory } from "../services/sql-chat-history.ts";

export function createAiRoute(params: {
  aiQueryService: AiQueryService;
  authService: AuthService;
  rateLimiter: InMemoryRateLimiter;
  chatSessionService: ChatSessionService;
  db: DatabaseClient;
}) {
  return new Elysia({ prefix: "/ai" })
    .post(
      "/query",
      async ({ body, request, set }) => {
        try {
          await params.authService.validate(request);
          const ip = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "unknown";
          params.rateLimiter.consume(`${body.tenant_id}:${ip}`);

          const requestId = request.headers.get("x-request-id") ?? randomUUID();
          const response = await params.aiQueryService.execute(body);

          set.status = 200;
          return {
            request_id: requestId,
            ...response
          };
        } catch (error) {
          console.error("Error in AI query handler:", error);
          throw error;
        }
      },
      {
        body: t.Object({
          tenant_id: t.String({ minLength: 1, maxLength: 128 }),
          user_query: t.String({ minLength: 3, maxLength: 1000 }),
          session_id: t.Optional(t.String())
        }),
        beforeHandle({ body }) {
          if (!/^[A-Za-z0-9_-]+$/.test(body.tenant_id)) {
            throw new ValidationError("Invalid tenant_id format.");
          }
        }
      }
    )
    .get(
      "/sessions",
      async ({ query, request }) => {
        await params.authService.validate(request);
        return await params.chatSessionService.listSessions(query.tenant_id);
      },
      {
        query: t.Object({
          tenant_id: t.String({ minLength: 1, maxLength: 128 })
        })
      }
    )
    .get(
      "/sessions/:id/messages",
      async ({ params: routeParams, query, request }) => {
        await params.authService.validate(request);
        const historyStore = new SqlChatMessageHistory(params.db, query.tenant_id, routeParams.id);
        const messages = await historyStore.getMessages();
        return messages.map(m => ({
          role: m._getType() === "human" ? "user" : "assistant",
          content: m.content
        }));
      },
      {
        params: t.Object({ id: t.String() }),
        query: t.Object({ tenant_id: t.String() })
      }
    )
    .patch(
      "/sessions/:id",
      async ({ params: routeParams, body, request }) => {
        await params.authService.validate(request);
        await params.chatSessionService.renameSession(body.tenant_id, routeParams.id, body.title);
        return { success: true };
      },
      {
        params: t.Object({ id: t.String() }),
        body: t.Object({
          tenant_id: t.String(),
          title: t.String({ minLength: 1, maxLength: 255 })
        })
      }
    )
    .delete(
      "/sessions/:id",
      async ({ params: routeParams, query, request }) => {
        await params.authService.validate(request);
        await params.chatSessionService.deleteSession(query.tenant_id, routeParams.id);
        return { success: true };
      },
      {
        params: t.Object({ id: t.String() }),
        query: t.Object({ tenant_id: t.String() })
      }
    );
}
