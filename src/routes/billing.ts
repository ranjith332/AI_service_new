import { randomUUID } from "node:crypto";

import { Elysia, t } from "elysia";

import type { AuthService } from "../services/auth.service.ts";
import type { TokenBillingService } from "../services/token-billing.service.ts";
import { ValidationError } from "../utils/errors.ts";
import type { InMemoryRateLimiter } from "../utils/rate-limiter.ts";

function assertTenantId(tenantId: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(tenantId)) {
    throw new ValidationError("Invalid tenant_id format.");
  }
}

export function createBillingRoute(params: {
  authService: AuthService;
  rateLimiter: InMemoryRateLimiter;
  tokenBillingService: TokenBillingService;
}) {
  return new Elysia({ prefix: "/billing" })
    .get("/tokens/catalog", () => params.tokenBillingService.getCatalog())
    .get("/tokens/wallet/:tenantId", async ({ params: routeParams, request }) => {
      await params.authService.validate(request);
      assertTenantId(routeParams.tenantId);
      params.rateLimiter.consume(`wallet:${routeParams.tenantId}:${request.headers.get("x-forwarded-for") ?? "unknown"}`);
      return params.tokenBillingService.getWalletSummary(routeParams.tenantId);
    })
    .post(
      "/tokens/recharge/init",
      async ({ body, request, set }) => {
        await params.authService.validate(request);
        assertTenantId(body.tenant_id);
        params.rateLimiter.consume(`recharge:${body.tenant_id}:${request.headers.get("x-forwarded-for") ?? "unknown"}`);
        set.status = 200;
        return {
          request_id: request.headers.get("x-request-id") ?? randomUUID(),
          ...(await params.tokenBillingService.initRecharge({
            tenantId: body.tenant_id,
            packageCode: body.package_code,
            customer: body.customer,
            returnUrl: body.return_url,
            notifyUrl: body.notify_url
          }))
        };
      },
      {
        body: t.Object({
          tenant_id: t.String({ minLength: 1, maxLength: 128 }),
          package_code: t.String({ minLength: 1, maxLength: 64 }),
          return_url: t.Optional(t.String({ format: "uri" })),
          notify_url: t.Optional(t.String({ format: "uri" })),
          customer: t.Object({
            customer_id: t.Optional(t.String({ minLength: 1, maxLength: 128 })),
            customer_name: t.Optional(t.String({ minLength: 1, maxLength: 120 })),
            customer_email: t.Optional(t.String({ format: "email" })),
            customer_phone: t.String({ minLength: 8, maxLength: 20 })
          })
        })
      }
    )
    .post(
      "/tokens/subscriptions/init",
      async ({ body, request, set }) => {
        await params.authService.validate(request);
        assertTenantId(body.tenant_id);
        params.rateLimiter.consume(`subscription:${body.tenant_id}:${request.headers.get("x-forwarded-for") ?? "unknown"}`);
        set.status = 200;
        return {
          request_id: request.headers.get("x-request-id") ?? randomUUID(),
          ...(await params.tokenBillingService.initSubscription({
            tenantId: body.tenant_id,
            planCode: body.plan_code,
            customer: body.customer,
            returnUrl: body.return_url
          }))
        };
      },
      {
        body: t.Object({
          tenant_id: t.String({ minLength: 1, maxLength: 128 }),
          plan_code: t.String({ minLength: 1, maxLength: 64 }),
          return_url: t.Optional(t.String({ format: "uri" })),
          customer: t.Object({
            customer_id: t.Optional(t.String({ minLength: 1, maxLength: 128 })),
            customer_name: t.Optional(t.String({ minLength: 1, maxLength: 120 })),
            customer_email: t.Optional(t.String({ format: "email" })),
            customer_phone: t.String({ minLength: 8, maxLength: 20 })
          })
        })
      }
    );
}
