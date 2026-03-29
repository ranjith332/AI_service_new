import { BookingService } from "./src/services/booking.service.ts";
import { DatabaseClient } from "./src/db/client.ts";
import { loadSchemaMapping } from "./src/db/schema-mapping.ts";

async function test() {
  const db = new DatabaseClient();
  const schema = await loadSchemaMapping();
  const booking = new BookingService(db, schema);
  const tenantId = "bc2428a0-604b-45c9-a04b-01e390ccace8";
  const doctorName = "Raju Boy";
  const date = new Date().toISOString().split('T')[0]; // Today

  console.log(`--- Testing HMS Availability Sync for ${doctorName} on ${date} ---`);

  // 1. Check Capacity (will trigger time-based blocking if it's afternoon)
  const capacity = await booking.checkCapacity(tenantId, 5, date, "morning");
  console.log("Morning Capacity Check:", capacity);

  // 2. Get Detailed Tokens (will trigger ratio logic)
  // Let's assume Dr 5 has a 1:2 ratio (every 2nd blocked)
  const tokens = await booking.getAvailableTokensDetailed(tenantId, doctorName, date, "morning");
  console.log("\nDetailed Tokens for Morning Session:");
  tokens.slice(0, 6).forEach(t => {
      console.log(`Token #${t.token}: ${t.status}`);
  });

  const hasBlocked = tokens.some(t => t.status === 'blocked');
  if (hasBlocked) {
      console.log("\n✅ HMS Blocked Token Logic is working!");
  } else {
      console.log("\n⚠️ No blocked tokens found (could be because ratio is 0 for this doctor).");
  }

  process.exit(0);
}

test().catch(console.error);
