import { DatabaseClient } from "./src/db/client.ts";
import { loadSchemaMapping } from "./src/db/schema-mapping.ts";
import fs from "node:fs";

async function check() {
  const client = new DatabaseClient();
  const schema = await loadSchemaMapping();
  const dr = schema.doctors;
  const ap = schema.appointments;
  const tenantId = "bc2428a0-604b-45c9-a04b-01e390ccace8";

  let out = "";
  out += "--- DOCTORS ---\n";
  const doctors = await client.query({
    text: `SELECT ${dr.id}, ${dr.firstName}, ${dr.lastName} FROM ${dr.table} WHERE ${dr.tenant} = ?`,
    values: [tenantId],
    description: "check_doctors"
  });
  doctors.rows.forEach(r => out += `Doctor: ${r.first_name} ${r.last_name} (ID: ${r.id})\n`);

  out += "\n--- TODAY'S APPOINTMENTS ---\n";
  const today = new Date().toISOString().split('T')[0];
  const appointments = await client.query({
    text: `SELECT a.${ap.id}, a.${ap.scheduledAt}, a.${ap.doctor}, a.${ap.patientName} FROM ${ap.table} a WHERE a.${ap.tenant} = ? AND a.${ap.scheduledAt} LIKE ?`,
    values: [tenantId, `%${today}%`],
    description: "check_appointments"
  });
  appointments.rows.forEach(r => out += `Appointment ID: ${r.id}, Date: ${r.opd_date}, Doctor ID: ${r.doctor_id}, Patient: ${r.patient_name}\n`);

  fs.writeFileSync("debug_output_final.txt", out);
  console.log("Done. Results in debug_output_final.txt");

  await client.close();
  process.exit(0);
}

check().catch(err => {
  console.error(err);
  process.exit(1);
});
