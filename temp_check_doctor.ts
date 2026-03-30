import { DatabaseClient } from './src/db/client.ts';
import { env } from './src/config/env.ts';

const db = new DatabaseClient({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME
});

async function run() {
    const res = await db.query({
        text: 'SELECT * FROM doctors WHERE first_name LIKE ? OR last_name LIKE ?',
        values: ['%Raju%', '%Raju%'],
        description: 'search_raju'
    });
    console.log(JSON.stringify(res.rows, null, 2));
    process.exit(0);
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
