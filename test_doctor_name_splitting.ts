import { SqlBuilderService } from "./src/services/sql-builder.service.ts";
import { loadSchemaMapping } from "./src/db/schema-mapping.ts";

async function testDoctorNameSplitting() {
    const schema = await loadSchemaMapping();
    const sqlBuilder = new SqlBuilderService(schema);

    const tenantId = '1';
    const doctorName = 'raju boy';

    console.log(`--- TEST: buildDoctorByNameQuery for '${doctorName}' ---`);
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
    
    console.log("SQL Text contains 'AND' for first/last name match:", query.text.includes("AND") && query.text.includes("first_name") && query.text.includes("last_name"));
    console.log("Number of placeholders (Expected 11):", (query.text.match(/\?/g) || []).length);
    console.log("Values:", JSON.stringify(query.values));
    
    const placeholdersCount = (query.text.match(/\?/g) || []).length;
    if (placeholdersCount === 11) {
        console.log("SUCCESS: Correct number of placeholders generated!");
    } else {
        console.log("FAILURE: Incorrect number of placeholders.");
    }

    process.exit(0);
}

testDoctorNameSplitting().catch(console.error);
