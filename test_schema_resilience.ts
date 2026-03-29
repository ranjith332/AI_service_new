import { intentSchema } from "./src/services/query-schemas.ts";

const dataWithNulls = {
  summary: "Test query",
  operation: "list",
  target: "appointments",
  metric: "invalid_metric", // Should fallback to "none"
  limit: null,               // Should fallback to 5
  sort: "unknown_sort",      // Should fallback to "latest"
  bookingDetails: null,      // Should fallback to default object
  confidence: null           // Should fallback to 1
};

console.log("Input data:", JSON.stringify(dataWithNulls, null, 2));

try {
  const result = intentSchema.parse(dataWithNulls);
  console.log("\nParsed result:", JSON.stringify(result, null, 2));
  
  const success = 
    result.metric === "none" &&
    result.limit === 5 &&
    result.sort === "latest" &&
    result.bookingDetails?.session === "none" &&
    result.confidence === 1;

  if (success) {
    console.log("\n✅ Schema resilience test PASSED!");
  } else {
    console.log("\n❌ Schema resilience test FAILED (values did not match defaults).");
    process.exit(1);
  }
} catch (error) {
  console.error("\n❌ Schema resilience test FAILED with error:", error);
  process.exit(1);
}
