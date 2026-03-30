import { DatabaseClient } from './src/db/client.ts';
import { loadSchemaMapping } from './src/db/schema-mapping.ts';
import { SqlBuilderService } from './src/services/sql-builder.service.ts';

async function test() {
    const db = new DatabaseClient();
    const schema = await loadSchemaMapping();
    const sqlBuilder = new SqlBuilderService(schema);

    const tenantId = 'bc2428a0-604b-45c9-a04b-01e390ccace8';
    const doctorName = 'Raju boy';
    
    const intent: any = {
        target: 'doctors',
        doctorName: doctorName,
        limit: 20,
        operation: 'list',
        timeRange: { preset: 'all_time' }
    };

    const query = sqlBuilder.build({
        tenantId,
        intent,
        schema,
        timeZone: 'UTC'
    });

    console.log("SQL:", query.text);
    console.log("Values:", JSON.stringify(query.values));

    const res = await db.query(query);
    console.log("Results count:", res.rows.length);
    console.log("Results:", JSON.stringify(res.rows, null, 2));

    process.exit(0);
}

test().catch(err => {
    console.error(err);
    process.exit(1);
});
