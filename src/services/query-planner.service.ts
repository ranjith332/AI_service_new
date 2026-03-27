import type { ExecutionStrategy, QueryIntent } from "./query-schemas.ts";
import { UnsupportedQueryError } from "../utils/errors.ts";

export interface QueryPlan {
  strategy: ExecutionStrategy;
  runSql: boolean;
  runVector: boolean;
  vectorTables: string[];
}

export class QueryPlannerService {
  plan(intent: QueryIntent): QueryPlan {
    if (intent.confidence < 0.2 && !intent.needsSql && !intent.needsVector) {
      throw new UnsupportedQueryError("The request was too ambiguous to execute safely.");
    }

    const vectorTables =
      intent.target === "lab_reports" || intent.target === "pathology_reports" || intent.target === "prescriptions"
        ? [intent.target]
        : ["lab_reports", "pathology_reports", "prescriptions", "medical_records"];

    const runSql =
      intent.needsSql ||
      intent.target === "unknown" ||
      ["appointments", "patients", "billing", "doctors"].includes(intent.target) ||
      intent.operation === "latest" ||
      intent.metric !== "none";

    const runVector =
      intent.needsVector ||
      intent.operation === "semantic_lookup" ||
      (["lab_reports", "pathology_reports", "prescriptions", "medical_records"].includes(intent.target) &&
        intent.operation === "summary");

    const strategy: ExecutionStrategy = runSql && runVector ? "hybrid" : runVector ? "vector" : "sql";

    return {
      strategy,
      runSql,
      runVector,
      vectorTables
    };
  }
}
