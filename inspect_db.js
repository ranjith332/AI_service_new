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
        const [rows] = await connection.execute('SELECT * FROM doctors');
        console.log("DOCTORS:");
        console.log(JSON.stringify(rows, null, 2));

        const [schedRows] = await connection.execute('SELECT * FROM schedules');
        console.log("SCHEDULES:");
        console.log(JSON.stringify(schedRows, null, 2));

        const [dayRows] = await connection.execute('SELECT * FROM schedule_days');
        console.log("SCHEDULE DAYS:");
        console.log(JSON.stringify(dayRows, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        await connection.end();
    }
}

run();
