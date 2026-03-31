import { DatabaseClient } from './src/db/client.ts';
const db = new DatabaseClient();
try {
    const [rows]: any = await db.mysqlPool.query('SHOW TABLES');
    console.log("Tables in database:", rows.map((r: any) => Object.values(r)[0]));
} catch (e) {
    console.error("Failed to list tables:", e);
} finally {
    process.exit(0);
}
