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

  const targetMapping: Record<string, string> = {
    appointment: "appointments",
    patient: "patients",
    prescription: "prescriptions",
    doctor: "doctors",
    medicine: "medicines",
    user: "users",
    dependent: "dependents",
    schedule: "schedules",
    scheduleday: "scheduleDays",
    doctorholiday: "doctorHolidays",
    doctorsession: "doctorSessions"
  };

  const normalizedTarget = targetMapping[intent.target] || intent.target;

  const vectorTables =
    normalizedTarget === "prescriptions" ||
    normalizedTarget === "medicines" ||
    normalizedTarget === "doctors" ||
    normalizedTarget === "patients" ||
    normalizedTarget === "dependents" ||
    normalizedTarget === "doctorHolidays"
      ? [normalizedTarget]
      : ["patients", "prescriptions", "medicines", "doctors", "dependents"];

  const runSql =
    intent.needsSql ||
    normalizedTarget === "unknown" ||
    ["appointments", "patients", "doctors", "medicines", "users", "dependents", "schedules", "scheduleDays", "doctorHolidays", "doctorSessions"].includes(normalizedTarget) ||
    intent.operation === "latest" ||
    intent.metric !== "none";

  const runVector =
    intent.needsVector ||
    intent.operation === "semantic_lookup" ||
    ["prescriptions", "medicines", "doctors", "patients", "dependents", "doctorHolidays"].includes(normalizedTarget) ||
    normalizedTarget === "unknown";

  const strategy: ExecutionStrategy = runSql && runVector ? "hybrid" : runVector ? "vector" : "sql";

  return {
    strategy,
    runSql,
    runVector,
    vectorTables
  };
  }
}
