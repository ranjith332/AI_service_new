import { SCHEMA_MAPPING } from "../db/schema-mapping.ts";
import { type QueryIntent } from "./query-schemas.ts";
import { resolveDateRange } from "../utils/time.ts";
import { logger } from "../utils/logger.ts";

export class SqlBuilderService {
  build(intent: QueryIntent, tenantId: string): { text: string; values: any[] } {
    let target = (intent.targets && intent.targets.length > 0) ? intent.targets[0] : "appointments";
    
    // Target Prioritization for PDF export
    if (intent.operation === "export_pdf" && intent.targets?.includes("prescriptions")) {
      target = "prescriptions";
    }

    const mapping = SCHEMA_MAPPING[target as keyof typeof SCHEMA_MAPPING];

    if (!mapping) {
      throw new Error(`Unsupported target entity: ${target}`);
    }

    let query = "";
    const values: any[] = [tenantId];
    let placeholderIndex = 1;

    if (intent.operation === "aggregate") {
      query = `SELECT COUNT(*) as count FROM ${mapping.table}`;
    } else {
      query = `SELECT ${mapping.table}.* FROM ${mapping.table}`;
    }

    // Handle Joins for filtering
    if (intent.filters.patientName && (mapping.table === "appointments" || mapping.table === "prescriptions")) {
      query += ` JOIN patients ON patients.id = ${mapping.table}.patient_id`;
    }

    query += ` WHERE ${mapping.table}.tenant_id = ?`;

    // Apply Filters
    if (intent.filters.doctorName) {
      if (mapping.table === "doctors") {
        query += ` AND (CONCAT(first_name, ' ', last_name) LIKE ?)`;
      } else if (mapping.columns.includes("doctor_id")) {
        query += ` AND EXISTS (SELECT 1 FROM doctors d WHERE d.id = ${mapping.table}.doctor_id AND (CONCAT(d.first_name, ' ', d.last_name) LIKE ?))`;
      }
      values.push(`%${intent.filters.doctorName}%`);
    }

    if (intent.filters.patientName) {
      if (mapping.table === "patients") {
        query += ` AND (CONCAT(first_name, ' ', last_name) LIKE ?)`;
      } else if (mapping.table === "appointments" || mapping.table === "prescriptions") {
        // We already added the JOIN above
        query += ` AND (CONCAT(patients.first_name, ' ', patients.last_name) LIKE ?)`;
      }
      values.push(`%${intent.filters.patientName}%`);
    }

    if (intent.filters.status) {
      query += ` AND status = ?`;
      values.push(intent.filters.status);
    }

    if (intent.filters.department) {
      query += ` AND department = ?`;
      values.push(intent.filters.department);
    }

    if (intent.filters.date) {
      try {
        const { start, end } = resolveDateRange(intent.filters.date);
        const dateCol = mapping.table === "appointments" ? "opd_date" : "created_at";
        query += ` AND \`${dateCol}\` BETWEEN ? AND ?`;
        values.push(start, end);
      } catch (e) {
        // Fallback or ignore invalid date
      }
    }

    if (intent.operation !== "aggregate") {
      query += ` LIMIT ${intent.filters.limit || 5}`;
    }

    // Replace placeholders for MySQL (using ? syntax)
    // Note: mysql2/promise uses ? placeholders natively, but we need to ensure the order is correct.
    
    return { text: query, values };
  }
}
