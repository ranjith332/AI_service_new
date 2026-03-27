import { and, desc, eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

import { getRechargePackage, getSubscriptionPlan, tokenRechargePackages, tokenSubscriptionPlans } from "../config/token-catalog.ts";
import { cashfreeRecharges, tokenSubscriptions, tokenTransactions, tokenWallets } from "../db/schema.ts";
import type { DatabaseClient } from "../db/client.ts";
import { AppError, ValidationError } from "../utils/errors.ts";
import { CashfreeService } from "./cashfree.service.ts";

interface CustomerInput {
  customer_id?: string;
  customer_name?: string;
  customer_email?: string;
  customer_phone: string;
}

export class TokenBillingService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly cashfree: CashfreeService
  ) {}

  getCatalog() {
    return {
      recharge_packages: tokenRechargePackages,
      subscription_plans: tokenSubscriptionPlans
    };
  }

  async getWalletSummary(tenantId: string) {
    const wallet = await this.ensureWallet(tenantId);
    const transactions = await this.db.orm
      .select()
      .from(tokenTransactions)
      .where(eq(tokenTransactions.tenantId, tenantId))
      .orderBy(desc(tokenTransactions.createdAt))
      .limit(20);

    const subscriptions = await this.db.orm
      .select()
      .from(tokenSubscriptions)
      .where(eq(tokenSubscriptions.tenantId, tenantId))
      .orderBy(desc(tokenSubscriptions.createdAt))
      .limit(10);

    return {
      wallet,
      transactions,
      subscriptions
    };
  }

  async initRecharge(input: {
    tenantId: string;
    packageCode: string;
    customer: CustomerInput;
    returnUrl?: string;
    notifyUrl?: string;
  }) {
    const selectedPackage = getRechargePackage(input.packageCode);
    if (!selectedPackage) {
      throw new ValidationError("Unknown token recharge package.");
    }

    const wallet = await this.ensureWallet(input.tenantId);
    const orderId = this.buildReference("rech", input.tenantId);
    const rechargeId = uuidv4();
    const transactionId = uuidv4();
    const customerId = input.customer.customer_id ?? `tenant_${input.tenantId}`;

    const cashfreeOrder = await this.cashfree.createRechargeOrder({
      orderId,
      amount: selectedPackage.amountInr,
      customer: {
        customer_id: customerId,
        customer_name: input.customer.customer_name,
        customer_email: input.customer.customer_email,
        customer_phone: input.customer.customer_phone
      },
      returnUrl: input.returnUrl,
      notifyUrl: input.notifyUrl,
      note: `Doctor Healix recharge for ${selectedPackage.name}`,
      tags: {
        tenant_id: input.tenantId,
        package_code: selectedPackage.code,
        tokens: String(selectedPackage.tokens)
      }
    });

    await this.db.orm.transaction(async (tx) => {
      await tx.insert(cashfreeRecharges).values({
        id: rechargeId,
        tenantId: input.tenantId,
        packageCode: selectedPackage.code,
        orderId,
        cfOrderId: cashfreeOrder.cf_order_id,
        paymentSessionId: cashfreeOrder.payment_session_id,
        amount: String(selectedPackage.amountInr),
        currency: "INR",
        tokens: selectedPackage.tokens,
        status: "initialized",
        customerId,
        customerName: input.customer.customer_name ?? null,
        customerEmail: input.customer.customer_email ?? null,
        customerPhone: input.customer.customer_phone,
        providerPayload: cashfreeOrder
      });

      await tx.insert(tokenTransactions).values({
        id: transactionId,
        tenantId: input.tenantId,
        walletId: wallet.id,
        transactionType: "recharge",
        status: "pending",
        tokensDelta: selectedPackage.tokens,
        amount: String(selectedPackage.amountInr),
        currency: "INR",
        referenceType: "cashfree_order",
        referenceId: orderId,
        metadata: {
          package_code: selectedPackage.code,
          cashfree_order_id: cashfreeOrder.cf_order_id
        }
      });
    });

    return {
      recharge_id: rechargeId,
      order_id: cashfreeOrder.order_id,
      cf_order_id: cashfreeOrder.cf_order_id,
      payment_session_id: cashfreeOrder.payment_session_id,
      amount: selectedPackage.amountInr,
      tokens: selectedPackage.tokens,
      currency: "INR",
      status: cashfreeOrder.order_status
    };
  }

  async initSubscription(input: {
    tenantId: string;
    planCode: string;
    customer: CustomerInput;
    returnUrl?: string;
  }) {
    const selectedPlan = getSubscriptionPlan(input.planCode);
    if (!selectedPlan) {
      throw new ValidationError("Unknown token subscription plan.");
    }

    await this.ensureWallet(input.tenantId);

    const subscriptionId = this.buildReference("sub", input.tenantId, 60);
    const recordId = uuidv4();
    const customerId = input.customer.customer_id ?? `tenant_${input.tenantId}`;

    const cashfreeSubscription = await this.cashfree.createSubscription({
      subscriptionId,
      customer: {
        customer_id: customerId,
        customer_name: input.customer.customer_name,
        customer_email: input.customer.customer_email,
        customer_phone: input.customer.customer_phone
      },
      plan: {
        name: selectedPlan.name,
        amount: selectedPlan.amountInr,
        currency: "INR",
        intervalType: selectedPlan.intervalType,
        intervalCount: selectedPlan.intervalCount,
        maxCycles: selectedPlan.maxCycles,
        note: `Doctor Healix token plan ${selectedPlan.code}`
      },
      authorizationAmount: selectedPlan.authorizationAmount,
      paymentMethods: selectedPlan.paymentMethods,
      returnUrl: input.returnUrl,
      tags: {
        tenant_id: input.tenantId,
        plan_code: selectedPlan.code,
        tokens_per_cycle: String(selectedPlan.tokensPerCycle)
      }
    });

    await this.db.orm.insert(tokenSubscriptions).values({
      id: recordId,
      tenantId: input.tenantId,
      planCode: selectedPlan.code,
      subscriptionId: cashfreeSubscription.subscription_id,
      cfSubscriptionId: cashfreeSubscription.cf_subscription_id,
      subscriptionSessionId: cashfreeSubscription.subscription_session_id,
      planName: selectedPlan.name,
      amount: String(selectedPlan.amountInr),
      currency: "INR",
      tokensPerCycle: selectedPlan.tokensPerCycle,
      intervalType: selectedPlan.intervalType,
      intervalCount: selectedPlan.intervalCount,
      status: this.mapSubscriptionStatus(cashfreeSubscription.subscription_status),
      customerId,
      customerName: input.customer.customer_name ?? null,
      customerEmail: input.customer.customer_email ?? null,
      customerPhone: input.customer.customer_phone,
      nextChargeAt: cashfreeSubscription.next_schedule_date ?? null,
      providerPayload: cashfreeSubscription
    });

    return {
      token_subscription_id: recordId,
      subscription_id: cashfreeSubscription.subscription_id,
      cf_subscription_id: cashfreeSubscription.cf_subscription_id,
      subscription_session_id: cashfreeSubscription.subscription_session_id,
      status: cashfreeSubscription.subscription_status,
      amount: selectedPlan.amountInr,
      tokens_per_cycle: selectedPlan.tokensPerCycle,
      currency: "INR"
    };
  }

  private async ensureWallet(tenantId: string) {
    const existing = await this.db.orm.select().from(tokenWallets).where(eq(tokenWallets.tenantId, tenantId)).limit(1);
    if (existing[0]) {
      return existing[0];
    }

    const id = uuidv4();
    await this.db.orm.insert(tokenWallets).values({
      id,
      tenantId,
      availableTokens: 0,
      consumedTokens: 0
    });

    const created = await this.db.orm.select().from(tokenWallets).where(and(eq(tokenWallets.id, id), eq(tokenWallets.tenantId, tenantId))).limit(1);
    if (!created[0]) {
      throw new AppError("Unable to initialize token wallet.", 500, "wallet_initialization_failed");
    }

    return created[0];
  }

  private buildReference(prefix: string, tenantId: string, maxLength = 45) {
    const normalizedTenant = tenantId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 12);
    const suffix = Date.now().toString(36);
    const random = uuidv4().replace(/-/g, "").slice(0, 10);
    return `${prefix}_${normalizedTenant}_${suffix}_${random}`.slice(0, maxLength);
  }

  private mapSubscriptionStatus(status: string) {
    switch (status.toUpperCase()) {
      case "ACTIVE":
        return "active" as const;
      case "CANCELLED":
        return "cancelled" as const;
      case "COMPLETED":
        return "completed" as const;
      case "FAILED":
        return "failed" as const;
      case "PAUSED":
        return "paused" as const;
      case "INITIALIZED":
      default:
        return "initialized" as const;
    }
  }
}
