import { BookingService } from "./src/services/booking.service.ts";
import { SqlBuilderService } from "./src/services/sql-builder.service.ts";
import { loadSchemaMapping } from "./src/db/schema-mapping.ts";
import { DatabaseClient } from "./src/db/client.ts";

async function testDoctorNameRobust() {
    const schema = await loadSchemaMapping();
    const db = new DatabaseClient();
    const booking = new BookingService(db as any, schema);
    const sqlBuilder = new SqlBuilderService(schema);

    const tenantId = '1'; // Standard development tenant
    const doctorName = 'raju boy';

    console.log(`--- TEST 1: BookingService.findDoctor for '${doctorName}' ---`);
    const dr = await booking.findDoctor(tenantId, doctorName);
    console.log("Doctor found by BookingService:", JSON.stringify(dr, null, 2));

    console.log("\n--- TEST 2: SqlBuilderService.buildDoctorByNameQuery (Robustness Check) ---");
    const intent: any = {
        target: 'doctors',
        operation: 'semantic_lookup',
        doctorName: doctorName
    };
    const params: any = {
        tenantId,
        intent,
        schema,
        timeZone: 'UTC'
    };
    const query = sqlBuilder.build(params);
    console.log("Generated SQL contains JOIN with users:", query.text.includes("LEFT JOIN users"));
    console.log("Generated SQL contains 6 matching patterns:", (query.text.match(/\?/g) || []).length === 7); // 1 for tenant + 6 for name
    console.log("SQL Description:", query.description);

    process.exit(0);
}

testDoctorNameRobust().catch(console.error);
