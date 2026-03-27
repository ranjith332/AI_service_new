# Doctor Healix AI Service

Production-grade backend for Doctor Healix with:

- Bun + Elysia API
- LangChain orchestration
- MySQL + Drizzle ORM
- Qdrant vector search
- OpenAI primary with NVIDIA Qwen fallback
- Cashfree token recharge and recurring token subscriptions
- Postman collection for local and staging verification

## Architecture

1. `POST /ai/query` accepts `tenant_id` and `user_query`.
2. Every AI request is tenant-scoped and enforced with `tenant_id`.
3. Intent extraction and planning decide whether to use SQL, vector search, or both.
4. MySQL is used for structured healthcare data and token billing records.
5. Qdrant stores embeddings for reports, prescriptions, and summaries.
6. Cashfree initializes one-time token recharges and recurring token subscriptions.
7. If a query falls outside the built-in healthcare templates, the service discovers live MySQL tables from `information_schema` and builds a validated tenant-safe SQL plan dynamically.

## Project Structure

```text
.
├─ config/
│  └─ schema-mapping.example.json
├─ scripts/
│  ├─ example-queries.json
│  └─ ingest.ts
├─ src/
│  ├─ config/
│  │  ├─ env.ts
│  │  └─ token-catalog.ts
│  ├─ db/
│  │  ├─ client.ts
│  │  ├─ schema-mapping.ts
│  │  └─ schema.ts
│  ├─ llm/
│  │  └─ provider.ts
│  ├─ routes/
│  │  ├─ ai.ts
│  │  └─ billing.ts
│  ├─ services/
│  │  ├─ ai-query.service.ts
│  │  ├─ auth.service.ts
│  │  ├─ cache.service.ts
│  │  ├─ cashfree.service.ts
│  │  ├─ db-executor.service.ts
│  │  ├─ intent.service.ts
│  │  ├─ query-planner.service.ts
│  │  ├─ query-schemas.ts
│  │  ├─ response-generator.service.ts
│  │  ├─ sql-builder.service.ts
│  │  ├─ token-billing.service.ts
│  │  └─ vector-search.service.ts
│  ├─ utils/
│  │  ├─ errors.ts
│  │  ├─ logger.ts
│  │  ├─ rate-limiter.ts
│  │  ├─ retry.ts
│  │  └─ time.ts
│  ├─ vector/
│  │  └─ qdrant.ts
│  ├─ app.ts
│  └─ index.ts
├─ drizzle.config.ts
├─ .env.example
└─ index.ts
```

## Database

This service now assumes MySQL only.

- `DB_CLIENT=mysql`
- `DATABASE_URL=mysql://root:root@localhost:3306/doctor_healix`

Drizzle schema for billing and tokens is defined in `src/db/schema.ts`.

Tables added:

- `token_wallets`
- `token_transactions`
- `cashfree_recharges`
- `token_subscriptions`

AI table access:

- Built-in templates still handle common healthcare queries efficiently.
- Dynamic SQL fallback now supports all tables in the active MySQL database that include a `tenant_id` column.
- The dynamic layer remains read-only and injects tenant filters automatically.

Generate or push schema:

```bash
bun run db:generate
bun run db:push
```

## Schema Assumptions For AI Queries

The AI query builder still uses a safe, mapped subset of the healthcare schema:

- `patients(id, tenant_id, full_name, gender, date_of_birth, chronic_conditions, updated_at)`
- `doctors(id, tenant_id, full_name, specialty, updated_at)`
- `appointments(id, tenant_id, patient_id, doctor_id, scheduled_at, status, updated_at)`
- `lab_reports(id, tenant_id, patient_id, report_name, summary, result_text, reported_at, updated_at)`
- `pathology_reports(id, tenant_id, patient_id, report_name, summary, result_text, reported_at, updated_at)`
- `prescriptions(id, tenant_id, patient_id, doctor_id, medication_name, dosage, instructions, prescribed_at, updated_at)`
- `billing(id, tenant_id, patient_id, doctor_id, total_amount, payment_status, billed_at, updated_at)`
- `medical_records(id, tenant_id, patient_id, diagnosis_summary, conditions, allergies, updated_at)`

If your real schema differs, create `config/schema-mapping.local.json` from `config/schema-mapping.example.json`.

## Environment

Create `.env` from `.env.example`.

Required values:

- `DATABASE_URL`
- `OPENAI_API_KEY`
- `QDRANT_URL`
- `CASHFREE_APP_ID`
- `CASHFREE_SECRET_KEY`

Optional:

- `NVIDIA_QWEN_API_KEY`
- `NVIDIA_QWEN_BASE_URL`
- `NVIDIA_QWEN_MODEL`
- `CASHFREE_RETURN_URL`
- `CASHFREE_NOTIFY_URL`

## Run

```bash
bun install
bun run db:push
bun run dev
```

## How To Execute

1. Create your `.env` from `.env.example`.
2. Point `DATABASE_URL` to your MySQL instance.
3. Fill `OPENAI_API_KEY`, `QDRANT_URL`, `CASHFREE_APP_ID`, and `CASHFREE_SECRET_KEY`.
4. Run `bun run db:push` to create the token billing tables.
5. Start the API with `bun run dev`.
6. Open Postman and import:
   - `postman/Doctor-Healix-AI-Service.postman_collection.json`
   - `postman/Doctor-Healix-Local.postman_environment.json`
7. Select the `Doctor Healix Local` environment.
8. Set `tenantId`, `customerEmail`, and `customerPhone` if needed.
9. Run `Health` first.
10. Run `AI Query - Built-in Example` or `AI Query - Dynamic All Tables Example`.
11. Run `Init Recharge` or `Init Subscription` to initialize Cashfree payment sessions.

## AI API

### `POST /ai/query`

```json
{
  "tenant_id": "hospital_123",
  "user_query": "Show today's appointments"
}
```

The response contains:

- `answer`
- `data.sql`
- `data.vector`
- `meta.strategy`
- `meta.provider`
- `meta.sql_mode`

`meta.sql_mode`:

- `mapped` means the request matched a built-in healthcare SQL template.
- `dynamic` means the request used live schema discovery and a validated dynamic SQL plan.

## Token Billing API

### `GET /billing/tokens/catalog`

Returns available recharge packs and subscription plans.

### `GET /billing/tokens/wallet/:tenantId`

Returns wallet balance, recent transactions, and token subscriptions for the tenant.

### `POST /billing/tokens/recharge/init`

Initializes a Cashfree order for a one-time token recharge.

```json
{
  "tenant_id": "hospital_123",
  "package_code": "growth_2500",
  "customer": {
    "customer_name": "Doctor Healix Billing",
    "customer_email": "ops@hospital.com",
    "customer_phone": "9876543210"
  }
}
```

Response fields include:

- `order_id`
- `cf_order_id`
- `payment_session_id`
- `amount`
- `tokens`

### `POST /billing/tokens/subscriptions/init`

Initializes a Cashfree recurring subscription for monthly token top-ups.

```json
{
  "tenant_id": "hospital_123",
  "plan_code": "monthly_3000",
  "customer": {
    "customer_name": "Doctor Healix Billing",
    "customer_email": "ops@hospital.com",
    "customer_phone": "9876543210"
  }
}
```

Response fields include:

- `subscription_id`
- `cf_subscription_id`
- `subscription_session_id`
- `tokens_per_cycle`
- `amount`

## Postman

Files included:

- `postman/Doctor-Healix-AI-Service.postman_collection.json`
- `postman/Doctor-Healix-Local.postman_environment.json`

Suggested test order:

1. `Health`
2. `Token Catalog`
3. `Token Wallet Summary`
4. `AI Query - Built-in Example`
5. `AI Query - Dynamic All Tables Example`
6. `Init Recharge`
7. `Init Subscription`

## Ingestion

Embeddings are stored in a shared Qdrant collection with tenant metadata.

```bash
bun run ingest
```

Optional flags:

- `--tenant=<tenant_id>`
- `--table=<patients|lab_reports|pathology_reports|prescriptions>`

## Security

- `tenant_id` is mandatory on tenant-scoped endpoints.
- AI SQL generation never exposes raw SQL to the caller.
- All AI SQL includes `tenant_id = ?`.
- Dynamic SQL only operates on tables discovered from the current MySQL schema that contain `tenant_id`.
- Vector search filters by `tenant_id`.
- Cashfree credentials stay server-side only.
- Recharge and subscription initialization are persisted before later reconciliation.

## Notes

- Recharge and subscription initialization are implemented. Payment success webhooks and token credit settlement are the next step if you want full wallet automation.
- Replace the in-memory rate limiter and cache with Redis for horizontal scaling.
