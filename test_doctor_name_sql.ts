import { SqlBuilderService } from "./src/services/sql-builder.service.ts";
import { loadSchemaMapping } from "./src/db/schema-mapping.ts";

async function testDoctorNameSql() {
    const schema = await loadSchemaMapping();
    const sqlBuilder = new SqlBuilderService(schema);
    
    console.log("--- TEST 1: Semantic Lookup for 'Raju boy' ---");
    const intent1: any = {
        target: 'doctors',
        operation: 'semantic_lookup',
        doctorName: 'raju boy'
    };
    
    const params: any = {
        tenantId: '123',
        intent: intent1,
        schema: schema,
        timeZone: 'UTC'
    };
    
    const query1 = sqlBuilder.build(params);
    console.log("SQL Text:", query1.text);
    console.log("Values:", JSON.stringify(query1.values));
    console.log("Description:", query1.description);
    
    if (query1.description === "doctor_by_name_lookup") {
        console.log("SUCCESS: Used name-based lookup!");
    } else {
        console.log("FAILURE: Did not use name-based lookup.");
    }

    console.log("\n--- TEST 2: General Doctor List (Should NOT rank) ---");
    const intent2: any = {
        target: 'doctors',
        operation: 'list'
    };
    
    const query2 = sqlBuilder.build({ ...params, intent: intent2 });
    console.log("Description:", query2.description);
    if (query2.description === "list_doctors") {
        console.log("SUCCESS: Defaulted to list_doctors!");
    } else if (query2.description === "doctor_appointment_ranking") {
        console.log("FAILURE: Still using ranking for list!");
    }

    process.exit(0);
}

testDoctorNameSql().catch(console.error);
