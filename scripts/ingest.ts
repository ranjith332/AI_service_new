import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { v5 as uuidv5 } from "uuid";
import { DateTime } from "luxon";

import { DatabaseClient } from "../src/db/client.ts";
import { env } from "../src/config/env.ts";
import { loadSchemaMapping } from "../src/db/schema-mapping.ts";
import { LlmProvider } from "../src/llm/provider.ts";
import { logger } from "../src/utils/logger.ts";
import { QdrantService } from "../src/vector/qdrant.ts";

type SupportedTable = "patients" | "prescriptions" | "medicines" | "doctors" | "dependents" | "schedules" | "scheduleDays" | "doctorHolidays" | "doctorSessions";

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

const QDRANT_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8"; // DNS Namespace

function formatMysqlDate(date: any): string {
  if (!date) return "1970-01-01 00:00:00";
  
  // Try to create a valid date object
  const d = new Date(date);
  if (isNaN(d.getTime())) {
    return "1970-01-01 00:00:00";
  }
  
  // Format as YYYY-MM-DD HH:mm:ss
  return d.toISOString().slice(0, 19).replace('T', ' ');
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

  const tables: SupportedTable[] = table ? [table] : ["patients", "prescriptions", "medicines", "doctors", "dependents", "schedules", "scheduleDays", "doctorHolidays", "doctorSessions"];

  for (const tableName of tables) {
    const cursorKey = `${tenantId ?? "all"}:${tableName}`;
    const lastSyncedAtRaw = state[cursorKey] ?? "1970-01-01 00:00:00";
    const lastSyncedAt = formatMysqlDate(lastSyncedAtRaw);

    let sql = "";
    const values: unknown[] = [lastSyncedAt];

    if (tableName === "patients") {
      const mapping = schema.patients;
      sql = `
        SELECT
          ${mapping.id} AS record_id,
          ${mapping.tenant} AS tenant_id,
          CONCAT(${mapping.firstName}, ' ', ${mapping.lastName}) AS title,
          CONCAT('Blood Group: ', COALESCE(${mapping.bloodGroup}, 'N/A'), ', Gender: ', ${mapping.gender}) AS body_text,
          ${mapping.updatedAt} AS updated_at
        FROM ${mapping.table}
        WHERE ${mapping.updatedAt} >= ?
      `;
      if (tenantId) {
        sql += ` AND ${mapping.tenant} = ?`;
        values.push(tenantId);
      }
    }

    if (tableName === "prescriptions") {
      const mapping = schema.prescriptions;
      sql = `
        SELECT
          rx.${mapping.id} AS record_id,
          rx.${mapping.tenant} AS tenant_id,
          rx.${mapping.patient} AS patient_id,
          CONCAT('Prescription for Patient #', rx.${mapping.patient}) AS title,
          CONCAT(
            'Clinical History: ', COALESCE(rx.${mapping.medicalHistory}, 'None'), '\n',
            'Current Medications: ', COALESCE(rx.${mapping.currentMedication}, 'None'), '\n',
            'Allergies: ', COALESCE(rx.${mapping.foodAllergies}, 'None'), '\n',
            'Advice: ', COALESCE(rx.${mapping.advice}, 'None'), '\n',
            'Health Conditions: ', 
            CASE WHEN rx.${mapping.diabetic} = '1' THEN 'Diabetic, ' ELSE '' END,
            CASE WHEN rx.${mapping.highBloodPressure} = '1' THEN 'High BP, ' ELSE '' END,
            CASE WHEN rx.${mapping.heartDisease} = '1' THEN 'Heart Disease, ' ELSE '' END,
            CASE WHEN rx.${mapping.pregnancy} = '1' THEN 'Pregnant, ' ELSE '' END,
            'Other: ', COALESCE(rx.${mapping.otherConditions}, 'None')
          ) AS body_text,
          rx.${mapping.updatedAt} AS updated_at
        FROM ${mapping.table} rx
        WHERE rx.${mapping.updatedAt} >= ?
      `;
      if (tenantId) {
        sql += ` AND rx.${mapping.tenant} = ?`;
        values.push(tenantId);
      }
    }

    if (tableName as string === "doctors") {
      const mapping = schema.doctors;
      sql = `
        SELECT
          ${mapping.id} AS record_id,
          ${mapping.tenant} AS tenant_id,
          CONCAT(${mapping.firstName}, ' ', ${mapping.lastName}) AS title,
          CONCAT('Specialty: ', ${mapping.specialty}, '\nDescription: ', COALESCE(${mapping.description}, '')) AS body_text,
          ${mapping.updatedAt} AS updated_at
        FROM ${mapping.table}
        WHERE ${mapping.updatedAt} >= ?
      `;
      if (tenantId) {
        sql += ` AND ${mapping.tenant} = ?`;
        values.push(tenantId);
      }
    }

    if (tableName === "medicines") {
      const mapping = schema.medicines;
      sql = `
        SELECT
          ${mapping.id} AS record_id,
          ${mapping.tenant} AS tenant_id,
          ${mapping.name} AS title,
          CONCAT(
            'Description: ', COALESCE(${mapping.description}, 'No description'), '\n',
            'Side Effects: ', COALESCE(${mapping.sideEffects}, 'None reported'), '\n',
            'Salt Composition: ', COALESCE(${mapping.saltComposition}, 'N/A'), '\n',
            'Quantity: ', ${mapping.quantity}, ' (Available: ', ${mapping.availableQuantity}, ')'
          ) AS body_text,
          ${mapping.updatedAt} AS updated_at
        FROM ${mapping.table}
        WHERE ${mapping.updatedAt} >= ?
      `;
      if (tenantId) {
        sql += ` AND ${mapping.tenant} = ?`;
        values.push(tenantId);
      }
    }

    if (tableName === "dependents") {
      const mapping = schema.dependents;
      sql = `
        SELECT
          ${mapping.id} AS record_id,
          (SELECT tenant_id FROM patients WHERE id = ${mapping.table}.patient_id LIMIT 1) AS tenant_id,
          ${mapping.patient} AS patient_id,
          CONCAT(${mapping.firstName}, ' ', ${mapping.lastName}) AS title,
          CONCAT('Relation: ', ${mapping.relation}, ', Age: ', COALESCE(${mapping.age}, 'N/A'), ', Gender: ', ${mapping.gender}) AS body_text,
          ${mapping.updatedAt} AS updated_at
        FROM ${mapping.table}
        WHERE ${mapping.updatedAt} >= ?
      `;
    }

    if (tableName === "schedules") {
      const mapping = schema.schedules;
      sql = `
        SELECT
          ${mapping.id} AS record_id,
          ${mapping.tenant} AS tenant_id,
          CONCAT('Schedule for Doctor #', ${mapping.doctor}) AS title,
          CONCAT('Type: ', ${mapping.scheduleType}, ', Per Patient Time: ', ${mapping.perPatientTime}) AS body_text,
          ${mapping.updatedAt} AS updated_at
        FROM ${mapping.table}
        WHERE ${mapping.updatedAt} >= ?
      `;
      if (tenantId) {
        sql += ` AND ${mapping.tenant} = ?`;
        values.push(tenantId);
      }
    }

    if (tableName === "scheduleDays") {
      const mapping = schema.scheduleDays;
      sql = `
        SELECT
          sd.${mapping.id} AS record_id,
          s.tenant_id AS tenant_id,
          CONCAT('Schedule Day: ', sd.${mapping.availableOn}, ' for Doctor #', sd.${mapping.doctor}) AS title,
          CONCAT(
            'Available: ', sd.${mapping.availableFrom}, ' to ', sd.${mapping.availableTo}, '\n',
            'Max Tokens: ', COALESCE(sd.${mapping.maxTokens}, 0), ', Morning: ', COALESCE(sd.${mapping.morningTokens}, 0),
            ', Afternoon: ', COALESCE(sd.${mapping.afternoonTokens}, 0), ', Night: ', COALESCE(sd.${mapping.nightTokens}, 0)
          ) AS body_text,
          sd.${mapping.updatedAt} AS updated_at
        FROM ${mapping.table} sd
        JOIN schedules s ON s.id = sd.${mapping.schedule}
        WHERE sd.${mapping.updatedAt} >= ?
      `;
      if (tenantId) {
        sql += ` AND s.tenant_id = ?`;
        values.push(tenantId);
      }
    }

    if (tableName === "doctorHolidays") {
      const mapping = schema.doctorHolidays;
      sql = `
        SELECT
          ${mapping.id} AS record_id,
          ${mapping.tenant} AS tenant_id,
          ${mapping.name} AS title,
          CONCAT('Holiday Date: ', ${mapping.date}, ' for Doctor #', ${mapping.doctor}) AS body_text,
          ${mapping.updatedAt} AS updated_at
        FROM ${mapping.table}
        WHERE ${mapping.updatedAt} >= ?
      `;
      if (tenantId) {
        sql += ` AND ${mapping.tenant} = ?`;
        values.push(tenantId);
      }
    }

    if (tableName === "doctorSessions") {
      const mapping = schema.doctorSessions;
      sql = `
        SELECT
          ${mapping.id} AS record_id,
          ${mapping.tenant} AS tenant_id,
          CONCAT('Doctor Session: ', ${mapping.sessionStatus}, ' on ', ${mapping.date}) AS title,
          CONCAT('Reason: ', COALESCE(${mapping.delayReason}, 'None'), ', Delay: ', COALESCE(${mapping.delayTime}, '0')) AS body_text,
          ${mapping.updatedAt} AS updated_at
        FROM ${mapping.table}
        WHERE ${mapping.updatedAt} >= ?
      `;
      if (tenantId) {
        sql += ` AND ${mapping.tenant} = ?`;
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
      const updatedAt = formatMysqlDate(row.updated_at ?? lastSyncedAt);
      const text = `${title}\n${body}`.trim();

      if (!text) {
        continue;
      }

      const vector = await llm.embeddings.embedQuery(text);
      if (row === result.rows[0]) {
        logger.debug({ dimension: vector.length }, "Generated first embedding in batch");
      }

      points.push({
        id: uuidv5(`${tableName}:${tenant}:${recordId}`, QDRANT_NAMESPACE),
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
