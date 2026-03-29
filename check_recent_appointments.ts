import { DatabaseClient } from "./src/db/client.ts";
import { loadSchemaMapping } from "./src/db/schema-mapping.ts";
import fs from "node:fs";

async function checkAppointments() {
  const client = new DatabaseClient();
  const schema = await loadSchemaMapping();
  const ap = schema.appointments;
  const tenantId = "bc2428a0-604b-45c9-a04b-01e390ccace8";

  const res = await client.query<any>({
    text: `SELECT * FROM ${ap.table} WHERE ${ap.tenant} = ? ORDER BY id DESC LIMIT 5`,
    values: [tenantId],
    description: "check_recent_appointments"
  });

  fs.writeFileSync("appointments_output_final.txt", JSON.stringify(res.rows, null, 2));
  console.log("Done");

  await client.close();
  process.exit(0);
}

checkAppointments().catch(console.error);
