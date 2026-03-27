import { randomUUID } from "node:crypto";

import { Elysia, t } from "elysia";

import type { AiQueryService } from "../services/ai-query.service.ts";
import type { AuthService } from "../services/auth.service.ts";
import type { InMemoryRateLimiter } from "../utils/rate-limiter.ts";
import { ValidationError } from "../utils/errors.ts";

export function createAiRoute(params: {
  aiQueryService: AiQueryService;
  authService: AuthService;
  rateLimiter: InMemoryRateLimiter;
}) {
  return new Elysia({ prefix: "/ai" }).post(
    "/query",
    async ({ body, request, set }) => {
      console.log("Incoming request body:", JSON.stringify(body, null, 2));
      
      try {
        await params.authService.validate(request);
        console.log("Auth validation passed");

        const ip = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "unknown";
        console.log("IP detection:", ip);

        params.rateLimiter.consume(`${body.tenant_id}:${ip}`);
        console.log("Rate limit check passed");

        const requestId = request.headers.get("x-request-id") ?? randomUUID();
        console.log("Executing aiQueryService for requestId:", requestId);

        const response = await params.aiQueryService.execute(body);
        console.log("aiQueryService execution completed");

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
        user_query: t.String({ minLength: 3, maxLength: 1000 })
      }),
      beforeHandle({ body }) {
        if (!/^[A-Za-z0-9_-]+$/.test(body.tenant_id)) {
          throw new ValidationError("Invalid tenant_id format.");
        }
      }
    }
  );
}
