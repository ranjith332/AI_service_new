import { DatabaseClient } from "./src/db/client.ts";

async function run() {
    const db = new DatabaseClient({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || "3306"),
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
    });

    try {
        const res = await db.query<any>({ text: "SELECT * FROM doctors" });
        console.log(JSON.stringify(res.rows, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        await db.close();
    }
}

run();
