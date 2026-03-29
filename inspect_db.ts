import { DatabaseClient } from "./src/db/client";

async function run() {
    const db = new DatabaseClient({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || "3306"),
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
    });

    try {
        console.log("--- DOCTORS ---");
        const drs = await db.query<any>({ text: "SELECT id, first_name, last_name, tenant_id FROM doctors" });
        console.log(JSON.stringify(drs.rows, null, 2));

        console.log("--- SCHEDULES ---");
        const scheds = await db.query<any>({ text: "SELECT * FROM schedules" });
        console.log(JSON.stringify(scheds.rows, null, 2));

        console.log("--- SCHEDULE DAYS ---");
        const days = await db.query<any>({ text: "SELECT * FROM schedule_days" });
        console.log(JSON.stringify(days.rows, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        await db.close();
    }
}

run();
