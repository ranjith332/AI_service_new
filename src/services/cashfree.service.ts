import { randomUUID } from "node:crypto";

import { env } from "../config/env.ts";
import { AppError } from "../utils/errors.ts";
import { withRetry } from "../utils/retry.ts";

interface CashfreeCustomerDetails {
  customer_id: string;
  customer_name?: string;
  customer_email?: string;
  customer_phone: string;
}

interface CreateOrderInput {
  orderId: string;
  amount: number;
  customer: CashfreeCustomerDetails;
  returnUrl?: string;
  notifyUrl?: string;
  note: string;
  tags?: Record<string, string>;
}

interface CreateSubscriptionInput {
  subscriptionId: string;
  customer: CashfreeCustomerDetails;
  plan: {
    name: string;
    amount: number;
    currency: string;
    intervalType: "DAY" | "WEEK" | "MONTH" | "YEAR";
    intervalCount: number;
    maxCycles: number;
    note: string;
  };
  authorizationAmount: number;
  paymentMethods: string[];
  returnUrl?: string;
  tags?: Record<string, string>;
}

export class CashfreeService {
  private readonly baseUrl = env.CASHFREE_ENV === "production" ? "https://api.cashfree.com/pg" : "https://sandbox.cashfree.com/pg";

  private assertConfigured() {
    if (!env.CASHFREE_APP_ID || !env.CASHFREE_SECRET_KEY) {
      throw new AppError(
        "Cashfree credentials are not configured. Set CASHFREE_APP_ID and CASHFREE_SECRET_KEY.",
        500,
        "cashfree_not_configured"
      );
    }
  }

  private async request<T>(path: string, body: Record<string, unknown>): Promise<T> {
    this.assertConfigured();

    const requestId = randomUUID();
    const idempotencyKey = randomUUID();

    const response = await withRetry(async () => {
      const result = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-version": env.CASHFREE_API_VERSION,
          "x-client-id": env.CASHFREE_APP_ID!,
          "x-client-secret": env.CASHFREE_SECRET_KEY!,
          "x-request-id": requestId,
          "x-idempotency-key": idempotencyKey
        },
        body: JSON.stringify(body)
      });

      if (result.status >= 500) {
        throw new AppError(`Cashfree temporary failure ${result.status}.`, 502, "cashfree_retryable");
      }

      return result;
    });

    if (!response.ok) {
      const text = await response.text();
      throw new AppError(`Cashfree request failed with status ${response.status}.`, 502, "cashfree_error", text);
    }

    return (await response.json()) as T;
  }

  async createRechargeOrder(input: CreateOrderInput) {
    return this.request<{
      cf_order_id: string;
      order_id: string;
      order_amount: number;
      order_currency: string;
      order_status: string;
      payment_session_id: string;
      order_expiry_time?: string;
      customer_details?: Record<string, unknown>;
      order_meta?: Record<string, unknown>;
    }>("/orders", {
      order_id: input.orderId,
      order_amount: input.amount,
      order_currency: "INR",
      customer_details: input.customer,
      order_meta: {
        return_url: input.returnUrl ?? env.CASHFREE_RETURN_URL,
        notify_url: input.notifyUrl ?? env.CASHFREE_NOTIFY_URL
      },
      order_note: input.note,
      order_tags: input.tags ?? {}
    });
  }

  async createSubscription(input: CreateSubscriptionInput) {
    const sessionExpiry = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const firstChargeTime = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const expiryTime = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

    return this.request<{
      cf_subscription_id: string;
      subscription_id: string;
      subscription_session_id: string;
      subscription_status: string;
      plan_details?: Record<string, unknown>;
      customer_details?: Record<string, unknown>;
      next_schedule_date?: string | null;
    }>("/subscriptions", {
      subscription_id: input.subscriptionId,
      customer_details: input.customer,
      plan_details: {
        plan_name: input.plan.name,
        plan_type: "PERIODIC",
        plan_amount: input.plan.amount,
        plan_max_amount: input.plan.amount,
        plan_max_cycles: input.plan.maxCycles,
        plan_intervals: input.plan.intervalCount,
        plan_currency: input.plan.currency,
        plan_interval_type: input.plan.intervalType,
        plan_note: input.plan.note
      },
      authorization_details: {
        authorization_amount: input.authorizationAmount,
        authorization_amount_refund: false,
        payment_methods: input.paymentMethods
      },
      subscription_meta: {
        return_url: input.returnUrl ?? env.CASHFREE_RETURN_URL,
        session_id_expiry: sessionExpiry
      },
      subscription_expiry_time: expiryTime,
      subscription_first_charge_time: firstChargeTime,
      subscription_tags: input.tags ?? {}
    });
  }
}
