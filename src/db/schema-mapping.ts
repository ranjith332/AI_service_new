import * as fs from "fs";
import * as path from "path";

const DEFAULT_MAPPING = {
  patients: {
    table: "patients",
    columns: ["id", "first_name", "last_name", "email", "phone", "gender", "dob", "blood_group", "address"],
  },
  doctors: {
    table: "doctors",
    columns: ["id", "first_name", "last_name", "speciality", "experience", "bio"],
  },
  appointments: {
    table: "appointments",
    columns: ["id", "patient_id", "doctor_id", "opd_date", "token_number", "payment_status", "is_completed", "patient_name", "appointment_type"],
  },
};

function loadMapping(): Record<string, { table: string; columns: string[] }> {
  const localPath = path.join(process.cwd(), "config", "schema-mapping.local.json");
  if (fs.existsSync(localPath)) {
    try {
      const content = fs.readFileSync(localPath, "utf8");
      // Sanitize potential BOM or weird whitespace
      const sanitized = content.trim().replace(/^\uFEFF/, "");
      const data = JSON.parse(sanitized);
      const mapping: Record<string, { table: string; columns: string[] }> = {};
      for (const entity in data) {
        const config = data[entity];
        const cols = Object.keys(config).filter(k => k !== "table" && !k.toLowerCase().includes("password"));
        mapping[entity] = {
          table: config.table,
          columns: cols.map(k => config[k])
        };
      }
      return mapping;
    } catch (e: any) {
      console.error(`❌ Failed to parse local schema mapping at ${localPath}: ${e.message}`);
    }
  }
  return DEFAULT_MAPPING;
}

export const SCHEMA_MAPPING = loadMapping();
