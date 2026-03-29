import { DatabaseClient } from "./src/db/client.ts";

async function checkSuriya() {
    const db = new DatabaseClient();
    const res = await db.query<any>({
        text: "SELECT p.id, u.first_name, u.last_name FROM patients p JOIN users u ON u.id = p.user_id WHERE u.first_name LIKE '%Suriya%' OR u.last_name LIKE '%Suriya%'",
        values: [],
        description: "check_suriya_corrected"
    });
    console.log("Joined Search Results:", res.rows);
    
    const res2 = await db.query<any>({
        text: "SELECT p.id, p.tenant_id, u.first_name, u.last_name FROM patients p JOIN users u ON u.id = p.user_id WHERE p.id = 5",
        values: [],
        description: "check_patient_5_tenant"
    });
    console.log("Patient 5 Results:", res2.rows);

    await db.close();
}

checkSuriya().catch(console.error);
