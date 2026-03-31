import { DatabaseClient } from "./src/db/client.ts";

async function findData() {
  const db = new DatabaseClient();
  const res = await db.query({ text: "SELECT tenant_id FROM users WHERE tenant_id IS NOT NULL LIMIT 1", values: [], description: "find_tenant" });
  process.stdout.write("TENANT_ID: " + res.rows[0]?.tenant_id + "\n");
  
  const res2 = await db.query({ text: "SELECT first_name, last_name FROM doctors LIMIT 1", values: [], description: "find_doctor" });
  process.stdout.write("DOCTOR_NAME: " + res2.rows[0]?.first_name + " " + res2.rows[0]?.last_name + "\n");
  
  const res3 = await db.query({ text: "SELECT u.first_name, u.last_name FROM users u JOIN patients p ON p.user_id = u.id LIMIT 1", values: [], description: "find_patient" });
  process.stdout.write("PATIENT_NAME: " + res3.rows[0]?.first_name + " " + res3.rows[0]?.last_name + "\n");

  await db.close();
}

findData().catch(console.error);
