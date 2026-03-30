import { DatabaseClient } from "./src/db/client.ts";

async function checkUserType() {
    const db = new DatabaseClient();
    console.log("Checking users table metadata...");
    const res = await db.query({
        text: `SELECT * FROM users WHERE LOWER(first_name) LIKE '%ravi%'`,
        values: [],
        description: "check_ravi_details"
    });
    console.log(JSON.stringify(res.rows, null, 2));
    await db.close();
}

checkUserType().catch(console.error);
