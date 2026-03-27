import type { QueryIntent } from "./query-schemas.ts";
import { intentSchema } from "./query-schemas.ts";
import type { LlmProvider } from "../llm/provider.ts";

export class IntentService {
  constructor(private readonly llm: LlmProvider) {}

  async classify(tenantId: string, userQuery: string): Promise<{ provider: "openai" | "nvidia_qwen"; intent: QueryIntent }> {
    const system = [
      "You classify healthcare analytics queries into a strict schema.",
      "Return only values grounded in the user request.",
      "Do not invent identifiers, patients, or filters.",
      "Assume a shared database where tenant isolation is mandatory and already enforced downstream.",
      "Use needsVector=true only for semantic search over free-text clinical content such as report summaries, prescriptions, or medical notes.",
      "Use needsSql=true for counts, lists, latest records, names, joins, billing, appointments, or aggregations.",
      "If the request appears to target a database table outside the core built-in healthcare targets, set target=unknown and keep needsSql=true.",
      "If the user asks for the latest or most recent report, use operation=latest.",
      "If unsure, choose target=unknown and set confidence below 0.5."
    ].join(" ");

    const user = JSON.stringify({
      tenant_id: tenantId,
      user_query: userQuery
    });

    const result = await this.llm.invokeStructured(intentSchema, {
      system,
      user,
      schemaName: "DoctorHealixIntent"
    });

    return {
      provider: result.provider,
      intent: result.output
    };
  }
}
