import { loadSchemaMapping } from "./src/db/schema-mapping.ts";
import { SqlBuilderService } from "./src/services/sql-builder.service.ts";
import { env } from "./src/config/env.ts";

async function test() {
  try {
    const schema = await loadSchemaMapping();
    const sqlBuilder = new SqlBuilderService();
    const tenantId = "test_tenant";
    const timeZone = "UTC";

    const targets = ["appointments", "patients", "doctors", "prescriptions", "medicines"] as const;

    for (const target of targets) {
      console.log(`\n--- Testing target: ${target} ---`);
      try {
        const query = sqlBuilder.build({
          tenantId,
          intent: {
            target,
            operation: "list",
            limit: 10,
            timeRange: { preset: "all_time", start: null, end: null },
            patientName: null,
            doctorName: null,
            condition: null,
            metric: "none",
            needsSql: true,
            needsVector: false,
            sort: "latest",
            confidence: 1,
            summary: `List ${target}`
          } as any,
          schema,
          timeZone
        });
        console.log("SQL:", query.text);
        console.log("Values:", JSON.stringify(query.values));
      } catch (e) {
        console.error(`Error building ${target}:`, e.message);
      }
    }
  } catch (err) {
    console.error("Test failed:", err);
  }
}

test();
