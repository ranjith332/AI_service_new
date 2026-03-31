import { DatabaseClient } from "./src/db/client.ts";
import { loadSchemaMapping } from "./src/db/schema-mapping.ts";
import { BookingService } from "./src/services/booking.service.ts";

async function verifyMechanisms() {
  console.log("🚀 Starting Zero-LLM HMS Sync Verification...");

  const db = new DatabaseClient();
  const schema = await loadSchemaMapping();
  const bookingService = new BookingService(db, schema);

  const tenantId = "00cf2631-d9cb-48b7-ae55-47f75754500d";
  const doctorName = "ramesh kumar"; 
  const patientName = "Amit Sharma";
  const today = new Date().toISOString().split('T')[0];

  console.log("\n1. Testing Doctor Session & Capacity Sync...");
  // Find doctor ID
  const doctor = await (bookingService as any).findDoctor(tenantId, doctorName);
  if (!doctor) {
     console.error("Doctor not found!");
     await db.close();
     process.exit(1);
  }

  const capacity = await bookingService.checkCapacity(tenantId, doctor.id, today, "morning");
  console.log("Capacity check result:", capacity);
  
  console.log("\n2. Testing Token/Slot Listing (HMS Logic - Time/Token Based + Ratio)...");
  const slots = await bookingService.getAvailableTokensDetailed(tenantId, doctorName, today, "morning");
  console.log(`Found ${slots.length} slots for today morning.`);
  if (slots.length > 0) {
    console.log("Sample Slot 1:", slots[0]);
    const blockedCount = slots.filter(s => s.status === 'blocked').length;
    console.log(`Ratio-blocked slots: ${blockedCount}`);
  }

  console.log("\n3. Testing Successful Appointment Creation (Logic-only)...");
  // Use book() to verify full flow without transaction table
  try {
     const bookRes = await (bookingService as any).createAppointment(tenantId, 1, doctor.id, {
        date: today,
        session: "morning",
        token: (slots.find(s => s.status === 'available')?.token || 1),
        name: patientName
     });
     console.log("✅ Successfully created appointment ID:", bookRes);
  } catch (e: any) {
     console.error("Booking failed:", e.message);
  }

  await db.close();
  console.log("\n✅ Verification mechanisms complete.");
}

verifyMechanisms().catch(console.error);
