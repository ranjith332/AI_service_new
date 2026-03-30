import { dynamicSqlPlanSchema, type DynamicSqlPlan } from "./query-schemas.ts";
import type { LlmProvider } from "../llm/provider.ts";
import type { DiscoveredSchema } from "./schema-discovery.service.ts";

export class DynamicSqlPlannerService {
  constructor(private readonly llm: LlmProvider) {}

  async createPlan(params: {
    tenantId: string;
    userQuery: string;
    schemaSummary: string;
  }): Promise<{ provider: "openai" | "nvidia_qwen"; plan: DynamicSqlPlan }> {
    const system = [
      "You create structured read-only MySQL query plans for a tenant-scoped healthcare SaaS.",
      "Use only tables and columns from the provided schema summary.",
      "Never output SQL.",
      "Every table has tenant_id and the system will inject tenant filters automatically.",
      "Prefer explicit joins when needed.",
      "Keep limit conservative and at most 100.",
      "Use aggregates only when the user asks for counts, totals, averages, minima, or maxima.",
      "If the query asks for many columns, still keep the selected columns focused and relevant.",
      "CRITICAL: Some tables (e.g. dependents, schedule_days) lack a direct tenant_id. You MUST join them with a parent table that HAS a tenant_id (e.g. dependents join patients on patient_id, schedule_days join schedules on schedule_id) to ensure isolation.",
      "CRITICAL: Return ONLY valid JSON. No introductory text or conversational filler."
    ].join(" ");

    const user = JSON.stringify({
      tenant_id: params.tenantId,
      user_query: params.userQuery,
      accessible_schema: params.schemaSummary
    });

    const result = await this.llm.invokeStructured(dynamicSqlPlanSchema, {
      system,
      user,
      schemaName: "DoctorHealixDynamicSqlPlan"
    });

    return {
      provider: result.provider,
      plan: result.output
    };
  }
}
