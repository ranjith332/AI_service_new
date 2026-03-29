import { DatabaseClient } from "./src/db/client";
import { BookingService } from "./src/services/booking.service";
import * as fs from "fs";

async function debug() {
    const db = new DatabaseClient({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || "3306"),
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
    });

    try {
        const mappingPath = "./config/schema-mapping.local.json";
        const schema = JSON.parse(fs.readFileSync(mappingPath, "utf-8"));

        const bookingService = new BookingService(db, schema);
        const tenantId = "bc2428a0-604b-45c9-a04b-01e390ccace8";
        const doctorName = "Raju Boy";

        // Find All Schedules for this doctor
        const res = await db.query<any>({
            text: `
                SELECT sd.*, s.schedule_type, s.token_block_option, sd.available_on
                FROM schedule_days sd
                INNER JOIN schedules s ON s.id = sd.schedule_id
                INNER JOIN doctors d ON d.id = s.doctor_id
                WHERE s.tenant_id = ? 
                  AND (LOWER(d.first_name) LIKE ? OR LOWER(d.last_name) LIKE ?)
                ORDER BY FIELD(sd.available_on, 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday')
            `,
            values: [tenantId, `%${doctorName.toLowerCase()}%`, `%${doctorName.toLowerCase()}%`],
            description: "debug_all_days"
        });
        console.log("ALL Schedule Days for Dr. Raju Boy:", JSON.stringify(res.rows, null, 2));

    } catch (e) {
        console.error(e);
    } finally {
        await db.close();
    }
}

debug();
