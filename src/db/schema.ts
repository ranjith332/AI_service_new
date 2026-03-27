import { decimal, int, json, mysqlEnum, mysqlTable, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

export const tokenWallets = mysqlTable(
  "token_wallets",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 128 }).notNull(),
    availableTokens: int("available_tokens").notNull().default(0),
    consumedTokens: int("consumed_tokens").notNull().default(0),
    createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "string" }).notNull().defaultNow().onUpdateNow()
  },
  (table) => ({
    tenantUniqueIdx: uniqueIndex("token_wallets_tenant_unique_idx").on(table.tenantId)
  })
);

export const tokenTransactions = mysqlTable(
  "token_transactions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 128 }).notNull(),
    walletId: varchar("wallet_id", { length: 36 }).notNull(),
    transactionType: mysqlEnum("transaction_type", [
      "recharge",
      "subscription",
      "usage",
      "adjustment",
      "refund"
    ]).notNull(),
    status: mysqlEnum("status", ["pending", "succeeded", "failed", "cancelled"]).notNull().default("pending"),
    tokensDelta: int("tokens_delta").notNull(),
    amount: decimal("amount", { precision: 12, scale: 2 }).notNull().default("0.00"),
    currency: varchar("currency", { length: 8 }).notNull().default("INR"),
    referenceType: varchar("reference_type", { length: 64 }).notNull(),
    referenceId: varchar("reference_id", { length: 128 }).notNull(),
    metadata: json("metadata"),
    createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "string" }).notNull().defaultNow().onUpdateNow()
  },
  (table) => ({
    tenantReferenceIdx: uniqueIndex("token_transactions_reference_unique_idx").on(table.referenceType, table.referenceId)
  })
);

export const cashfreeRecharges = mysqlTable(
  "cashfree_recharges",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 128 }).notNull(),
    packageCode: varchar("package_code", { length: 64 }).notNull(),
    orderId: varchar("order_id", { length: 45 }).notNull(),
    cfOrderId: varchar("cf_order_id", { length: 64 }),
    paymentSessionId: varchar("payment_session_id", { length: 255 }),
    amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 8 }).notNull().default("INR"),
    tokens: int("tokens").notNull(),
    status: mysqlEnum("status", ["initialized", "paid", "failed", "expired"]).notNull().default("initialized"),
    customerId: varchar("customer_id", { length: 128 }).notNull(),
    customerName: varchar("customer_name", { length: 120 }),
    customerEmail: varchar("customer_email", { length: 191 }),
    customerPhone: varchar("customer_phone", { length: 20 }).notNull(),
    providerPayload: json("provider_payload"),
    createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "string" }).notNull().defaultNow().onUpdateNow()
  },
  (table) => ({
    orderUniqueIdx: uniqueIndex("cashfree_recharges_order_unique_idx").on(table.orderId)
  })
);

export const tokenSubscriptions = mysqlTable(
  "token_subscriptions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 128 }).notNull(),
    planCode: varchar("plan_code", { length: 64 }).notNull(),
    subscriptionId: varchar("subscription_id", { length: 128 }).notNull(),
    cfSubscriptionId: varchar("cf_subscription_id", { length: 64 }),
    subscriptionSessionId: varchar("subscription_session_id", { length: 255 }),
    planName: varchar("plan_name", { length: 120 }).notNull(),
    amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 8 }).notNull().default("INR"),
    tokensPerCycle: int("tokens_per_cycle").notNull(),
    intervalType: varchar("interval_type", { length: 16 }).notNull(),
    intervalCount: int("interval_count").notNull(),
    status: mysqlEnum("status", ["initialized", "active", "paused", "cancelled", "completed", "failed"])
      .notNull()
      .default("initialized"),
    customerId: varchar("customer_id", { length: 128 }).notNull(),
    customerName: varchar("customer_name", { length: 120 }),
    customerEmail: varchar("customer_email", { length: 191 }),
    customerPhone: varchar("customer_phone", { length: 20 }).notNull(),
    nextChargeAt: timestamp("next_charge_at", { mode: "string" }),
    providerPayload: json("provider_payload"),
    createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "string" }).notNull().defaultNow().onUpdateNow()
  },
  (table) => ({
    subscriptionUniqueIdx: uniqueIndex("token_subscriptions_subscription_unique_idx").on(table.subscriptionId)
  })
);
