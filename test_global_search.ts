import { SqlBuilderService } from "./src/services/sql-builder.service.ts";
import { loadSchemaMapping } from "./src/db/schema-mapping.ts";

async function test() {
  const sqlBuilder = new SqlBuilderService();
  const schema = await loadSchemaMapping();
  const tenantId = "bc2428a0-604b-45c9-a04b-01e390ccace8";
  const timeZone = "Asia/Kolkata";

  const intent = {
    summary: "Checking Raju Boy",
    operation: "list",
    target: "appointments",
    doctorName: "Raju Boy",
    timeRange: { preset: "today" },
    limit: 5,
    needsSql: true,
    needsVector: false,
    sort: "latest",
    confidence: 1
  };

  console.log("--- Testing Appointments Query for 'Raju Boy' ---");
  const query = sqlBuilder.build({
    tenantId,
    intent: intent as any,
    schema,
    timeZone
  });

  console.log("Generated SQL:");
  console.log(query.text);
  console.log("Values:", query.values);

  const hasConcat = query.text.includes("CONCAT");
  const hasThreePlaceholders = query.values.filter(v => v === "%raju boy%").length >= 3;

  if (hasConcat && hasThreePlaceholders) {
    console.log("\n✅ Global Name Search Test PASSED (Appointments)");
  } else {
    console.log("\n❌ Global Name Search Test FAILED (Appointments)");
    console.log(`Has Concat: ${hasConcat}, Placeholder Count: ${query.values.filter(v => v === "%raju boy%").length}`);
  }

  console.log("\n--- Testing Schedules Query for 'Raju Boy' ---");
  const scheduleIntent = { ...intent, target: "schedules" };
  const scheduleQuery = sqlBuilder.build({
    tenantId,
    intent: scheduleIntent as any,
    schema,
    timeZone
  });
  console.log("Generated SQL:");
  console.log(scheduleQuery.text);
  if (scheduleQuery.text.includes("CONCAT")) {
     console.log("\n✅ Global Name Search Test PASSED (Schedules)");
  } else {
     console.log("\n❌ Global Name Search Test FAILED (Schedules)");
  }

  process.exit(0);
}

test().catch(console.error);
