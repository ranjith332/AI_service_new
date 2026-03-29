import { DatabaseClient } from "./src/db/client.ts";
import * as fs from "fs";

async function checkSchedule() {
    const env = process.env;
    const db = new DatabaseClient({
        host: env.DB_HOST,
        port: parseInt(env.DB_PORT || "3306"),
        user: env.DB_USER,
        password: env.DB_PASSWORD,
        database: env.DB_NAME
    });

    try {
        const tenantId = "bc2428a0-604b-45c9-a04b-01e390ccace8";
        const doctorName = "Raju Boy";
        
        // Find Doctor
        console.log("Searching for doctor...");
        const drRes = await db.query<any>({
            text: `SELECT id, first_name, last_name FROM doctors WHERE tenant_id = ? AND (LOWER(first_name) LIKE ? OR LOWER(last_name) LIKE ?)`,
            values: [tenantId, `%${doctorName.toLowerCase()}%`, `%${doctorName.toLowerCase()}%`]
        });
        
        if (drRes.rows.length === 0) {
            console.log("Doctor not found");
            return;
        }
        
        const dr = drRes.rows[0];
        console.log(`Doctor ID: ${dr.id}, Name: ${dr.first_name} ${dr.last_name}`);
        
        // Find Schedules
        const schedRes = await db.query<any>({
            text: `SELECT id, name FROM schedules WHERE doctor_id = ? AND tenant_id = ?`,
            values: [dr.id, tenantId]
        });
        console.log("Schedules:", schedRes.rows);
        
        if (schedRes.rows.length > 0) {
            for (const sched of schedRes.rows) {
                console.log(`Checking schedule: ${sched.name} (ID: ${sched.id})`);
                // Find Schedule Days
                const daysRes = await db.query<any>({
                    text: `SELECT * FROM schedule_days WHERE schedule_id = ?`,
                    values: [sched.id]
                });
                console.log(`Schedule Days for ${sched.name}:`, daysRes.rows);
            }
        } else {
            console.log("No schedules found for this doctor.");
        }

    } catch (e) {
        console.error(e);
    } finally {
        await db.close();
    }
}

checkSchedule();
