import { BookingService } from "./src/services/booking.service.ts";
import { loadSchemaMapping } from "./src/db/schema-mapping.ts";
import { DatabaseClient } from "./src/db/client.ts";

async function testFindPatient() {
    const schemaMapping = await loadSchemaMapping();
    const db = new DatabaseClient();
    const bookingService = new BookingService(db, schemaMapping);
    
    const tenantId = "bc2428a0-604b-45c9-a04b-01e390ccace8";
    const name = "SURIYA D";
    
    const patient = await bookingService.findPatient(tenantId, name);
    console.log("Found Patient for SURIYA D:", patient);
    
    await db.close();
}

testFindPatient().catch(console.error);
