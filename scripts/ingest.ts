import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { DatabaseClient } from "../src/db/client.ts";
import { env } from "../src/config/env.ts";
import { loadSchemaMapping } from "../src/db/schema-mapping.ts";
import { LlmProvider } from "../src/llm/provider.ts";
import { logger } from "../src/utils/logger.ts";
import { QdrantService } from "../src/vector/qdrant.ts";

type SupportedTable = "patients" | "lab_reports" | "pathology_reports" | "prescriptions";

interface IngestionState {
  [key: string]: string;
}

function parseCliArgs() {
  const args = Bun.argv.slice(2);
  const tenantArg = args.find((arg) => arg.startsWith("--tenant="));
  const tableArg = args.find((arg) => arg.startsWith("--table="));

  return {
    tenantId: tenantArg?.split("=")[1] ?? null,
    table: (tableArg?.split("=")[1] as SupportedTable | undefined) ?? null
  };
}

async function readState(): Promise<IngestionState> {
  if (!existsSync(env.INGESTION_STATE_PATH)) {
    return {};
  }

  const content = await readFile(env.INGESTION_STATE_PATH, "utf-8");
  return JSON.parse(content) as IngestionState;
}

async function writeState(state: IngestionState): Promise<void> {
  await mkdir(dirname(env.INGESTION_STATE_PATH), { recursive: true });
  await writeFile(env.INGESTION_STATE_PATH, JSON.stringify(state, null, 2));
}

async function main() {
  const { tenantId, table } = parseCliArgs();
  const schema = await loadSchemaMapping();
  const db = new DatabaseClient();
  const llm = new LlmProvider();
  const qdrant = new QdrantService();
  const state = await readState();

  if (!llm.embeddings) {
    throw new Error("OPENAI_API_KEY is required for ingestion embeddings.");
  }

  const tables: SupportedTable[] = table ? [table] : ["patients", "lab_reports", "pathology_reports", "prescriptions"];

  for (const tableName of tables) {
    const cursorKey = `${tenantId ?? "all"}:${tableName}`;
    const lastSyncedAt = state[cursorKey] ?? "1970-01-01T00:00:00.000Z";

    let sql = "";
    const values: unknown[] = [lastSyncedAt];

    if (tableName === "patients") {
      const mapping = schema.patients;
      sql = `
        SELECT
          ${mapping.idColumn} AS record_id,
          ${mapping.tenantColumn} AS tenant_id,
          ${mapping.nameColumn} AS title,
          ${mapping.conditionColumn} AS body_text,
          ${mapping.updatedAtColumn} AS updated_at
        FROM ${mapping.table}
        WHERE ${mapping.updatedAtColumn} >= ?
      `;
      if (tenantId) {
        sql += ` AND ${mapping.tenantColumn} = ?`;
        values.push(tenantId);
      }
    }

    if (tableName === "lab_reports" || tableName === "pathology_reports") {
      const mapping = schema[tableName];
      sql = `
        SELECT
          ${mapping.idColumn} AS record_id,
          ${mapping.tenantColumn} AS tenant_id,
          ${mapping.patientIdColumn} AS patient_id,
          ${mapping.nameColumn} AS title,
          CONCAT(COALESCE(${mapping.summaryColumn}, ''), ' ', COALESCE(${mapping.textColumn}, '')) AS body_text,
          ${mapping.updatedAtColumn} AS updated_at
        FROM ${mapping.table}
        WHERE ${mapping.updatedAtColumn} >= ?
      `;
      if (tenantId) {
        sql += ` AND ${mapping.tenantColumn} = ?`;
        values.push(tenantId);
      }
    }

    if (tableName === "prescriptions") {
      const mapping = schema.prescriptions;
      sql = `
        SELECT
          ${mapping.idColumn} AS record_id,
          ${mapping.tenantColumn} AS tenant_id,
          ${mapping.patientIdColumn} AS patient_id,
          ${mapping.medicationColumn} AS title,
          CONCAT(COALESCE(${mapping.dosageColumn}, ''), ' ', COALESCE(${mapping.instructionsColumn}, '')) AS body_text,
          ${mapping.updatedAtColumn} AS updated_at
        FROM ${mapping.table}
        WHERE ${mapping.updatedAtColumn} >= ?
      `;
      if (tenantId) {
        sql += ` AND ${mapping.tenantColumn} = ?`;
        values.push(tenantId);
      }
    }

    sql += " ORDER BY updated_at ASC";

    const result = await db.query({
      text: sql,
      values,
      description: `ingest_${tableName}`
    });

    const points = [];
    let latestSeen = lastSyncedAt;

    for (const row of result.rows as Array<Record<string, unknown>>) {
      const tenant = String(row.tenant_id);
      const recordId = String(row.record_id);
      const title = String(row.title ?? tableName);
      const body = String(row.body_text ?? "");
      const updatedAt = String(row.updated_at ?? lastSyncedAt);
      const text = `${title}\n${body}`.trim();

      if (!text) {
        continue;
      }

      const vector = await llm.embeddings.embedQuery(text);
      points.push({
        id: `${tableName}:${tenant}:${recordId}`,
        vector,
        payload: {
          tenant_id: tenant,
          table_name: tableName,
          record_id: recordId,
          patient_id: row.patient_id ? String(row.patient_id) : null,
          title,
          text,
          updated_at: updatedAt
        }
      });

      latestSeen = updatedAt > latestSeen ? updatedAt : latestSeen;
    }

    await qdrant.upsert(points);
    state[cursorKey] = latestSeen;

    logger.info(
      {
        table: tableName,
        tenant_id: tenantId,
        upserted: points.length,
        last_synced_at: latestSeen
      },
      "Completed vector ingestion batch"
    );
  }

  await writeState(state);
  await db.close();
}

await main();
