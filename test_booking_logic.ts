import { BookingService } from "./src/services/booking.service.ts";
import { loadSchemaMapping } from "./src/db/schema-mapping.ts";
import { DatabaseClient } from "./src/db/client.ts";

async function testBookingFlow() {
    const schema = await loadSchemaMapping();
    const db = new DatabaseClient();
    const booking = new BookingService(db as any, schema);

    const tenantId = 'bc2428a0-604b-45c9-a04b-01e390ccace8';
    const doctorName = 'raju boy';
    const patientName = 'Test Patient';

    console.log(`--- SIMULATING BOOKING FLOW FOR: ${doctorName} ---`);
    console.log("This will trigger the new robust 6-way name-splitting search...");
    
    try {
        // We just test the findDoctor part of the booking flow since that's what we improved
        const result = await (booking as any).findDoctor(tenantId, doctorName);
        
        console.log("\n[BOOKING DISCOVERY RESULT]");
        if (result && result.id === 5) {
            console.log("SUCCESS: Booking system correctly identified Dr. Raju Boy (ID: 5) using the new robust lookup!");
        } else {
            console.log("FAILURE: Booking system could not find the doctor.");
            console.log("Found:", JSON.stringify(result));
        }
    } catch (e) {
        console.error("Booking discovery failed:", e);
    }
    process.exit(0);
}

testBookingFlow().catch(console.error);
