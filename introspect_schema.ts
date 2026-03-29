import { DatabaseClient } from "./src/db/client.ts";
import { loadSchemaMapping } from "./src/db/schema-mapping.ts";
import fs from "node:fs";

async function checkColumns() {
  const client = new DatabaseClient();
  const schema = await loadSchemaMapping();
  
  let out = "";
  out += "--- APPOINTMENTS COLUMNS ---\n";
  const [cols] = await client.mysqlPool.query(`DESCRIBE ${schema.appointments.table}`);
  out += JSON.stringify(cols, null, 2) + "\n";

  out += "\n--- SCHEDULE_DAYS COLUMNS ---\n";
  const [sCols] = await client.mysqlPool.query(`DESCRIBE ${schema.scheduleDays.table}`);
  out += JSON.stringify(sCols, null, 2) + "\n";

  fs.writeFileSync("introspect_output_final.txt", out);
  console.log("Done");

  await client.close();
  process.exit(0);
}

checkColumns().catch(console.error);
