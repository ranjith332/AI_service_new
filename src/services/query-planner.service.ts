import { type QueryIntent, type QueryPlan } from "./query-schemas.ts";
import { logger } from "../utils/logger.ts";

export class QueryPlannerService {
  plan(intent: QueryIntent): QueryPlan {
    const actions: QueryPlan["actions"] = [];
    let runVector = false;

    switch (intent.operation) {
      case "aggregate":
      case "list":
      case "lookup":
      case "book":
        actions.push({
          type: "sql",
          priority: 1,
          description: `Execute SQL for ${intent.operation} on ${intent.targets.join(", ")}`,
        });
        // Only generate PDF for lookups if prescriptions are targeted
        if (intent.operation === "lookup" && intent.targets.includes("prescriptions")) {
          actions.push({
            type: "pdf",
            priority: 2,
            description: "Generate prescription PDF document",
          });
        }
        runVector = false;
        break;

      case "export_pdf":
        actions.push({
          type: "sql",
          priority: 1,
          description: `Execute SQL for export_pdf on ${intent.targets.join(", ")}`,
        });
        actions.push({
          type: "pdf",
          priority: 2,
          description: "Generate prescription PDF document",
        });
        runVector = false;
        break;

      case "semantic_lookup":
        actions.push({
          type: "sql",
          priority: 1,
          description: "Check structured data for entity details",
        });
        actions.push({
          type: "vector",
          priority: 2,
          description: "Search vector knowledge base for bio/descriptions",
        });
        runVector = true; // Hybrid
        break;

      case "general_knowledge":
        actions.push({
          type: "vector",
          priority: 1,
          description: "Search vector knowledge base for medical info",
        });
        runVector = true;
        break;

      default:
        actions.push({
          type: "sql",
          priority: 1,
          description: "Default SQL execution",
        });
        runVector = false;
    }

    const plan: QueryPlan = {
      intent,
      actions: actions.sort((a, b) => a.priority - b.priority),
      runVector,
    };

    logger.info({ plan }, "Query plan generated");
    return plan;
  }
}
