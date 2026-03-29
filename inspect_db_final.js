const mysql = require('mysql2/promise');

async function run() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || "3306"),
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
    });

    try {
        const tenantId = "bc2428a0-604b-45c9-a04b-01e390ccace8";
        
        const [drs] = await connection.execute(
            'SELECT id, first_name, last_name FROM doctors WHERE tenant_id = ? AND (LOWER(first_name) LIKE ? OR LOWER(last_name) LIKE ?)',
            [tenantId, '%raju%', '%raju%']
        );
        console.log("DOCTORS:");
        console.log(JSON.stringify(drs, null, 2));

        if (drs.length > 0) {
            const drId = drs[0].id;
            const [days] = await connection.execute(
                `SELECT sd.*, s.name as schedule_name 
                 FROM schedule_days sd 
                 JOIN schedules s ON s.id = sd.schedule_id 
                 WHERE s.doctor_id = ? AND s.tenant_id = ?`,
                [drId, tenantId]
            );
            console.log("SCHEDULE DAYS:");
            console.log(JSON.stringify(days, null, 2));
        }
    } catch (e) {
        console.error(e);
    } finally {
        await connection.end();
    }
}

run();
