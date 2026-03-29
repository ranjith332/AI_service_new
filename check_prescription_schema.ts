import { DatabaseClient } from "./src/db/client.ts";

async function findPrescriptionMedicinesTable() {
    const db = new DatabaseClient();
    const res = await db.query<any>({
        text: "SHOW TABLES",
        values: [],
        description: "list_all_tables"
    });
    console.log("--- TABLES ---");
    res.rows.forEach(r => console.log(Object.values(r)[0]));
    
    const columns = await db.query<any>({
        text: "SHOW COLUMNS FROM prescriptions_medicines",
        values: [],
        description: "check_pm_cols"
    });
    console.log("--- PM COLUMNS ---");
    columns.rows.forEach(c => console.log(c.Field));
    
    await db.close();
}

findPrescriptionMedicinesTable().catch(console.error);
