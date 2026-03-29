import { DatabaseClient } from "./src/db/client";

const db = new DatabaseClient();
const res = await db.query({ text: "SELECT id, first_name, last_name, tenant_id FROM doctors", values: [], description: "list_doctors" });
console.log(JSON.stringify(res.rows, null, 2));
await db.close();
