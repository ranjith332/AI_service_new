import { logger } from "../utils/logger.ts";
import type { QueryIntent } from "./query-schemas.ts";
import { intentSchema, intentSchemaRaw } from "./query-schemas.ts";
import type { LlmProvider } from "../llm/provider.ts";

export class IntentService {
  constructor(private readonly llm: LlmProvider) {}

  async classify(tenantId: string, userQuery: string): Promise<{ provider: "openai" | "nvidia_qwen"; intent: QueryIntent }> {
    try {
      const system = [
        "You classify healthcare analytics queries into a strict schema.",
        "Classify healthcare analytic queries into the provided JSON schema using these core rules:",
        "1. Ground all values (summary, names, metrics) in the user request. No invented identifiers.",
        "2. Operation Mapping: 'book' (for scheduling), 'export_pdf' (for documents), 'lookup' (for slots/tokens/schedules), 'semantic_lookup' (for text search), 'general_knowledge' (non-medical topics).",
        "3. Target Mapping: 'appointments', 'patients', 'prescriptions', 'doctors', 'medicines', 'schedules' (for availability/stats).",
        "4. Mandatory for 'book': requires morning|afternoon|night session. If missing, set needsClarification=true.",
        "5. Date Resolution: Resolve 'today', 'tomorrow', 'next Monday' based on current date: " + new Date().toISOString().split('T')[0] + ".",
        "6. Tokens/Slots: Any query about available tokens or doctor availability ALWAYS uses operation='lookup' and target='schedules'.",
        "7. Handling Greetings: Queries like 'Hi', 'Hello', 'Hey' or non-data queries are NOT medical inquiries. You MUST classify them as operation='general_knowledge' and target='unknown'.",
        "8. Output ONLY the JSON object."
      ].join(" ");

      const user = JSON.stringify({
        tenant_id: tenantId,
        user_query: userQuery
      });

      // Use RAW schema for AI interaction (no transforms allowed here)
      const result = await this.llm.invokeStructured(intentSchemaRaw, {
        system,
        user,
        schemaName: "DoctorHealixIntent",
        useFastModel: true
      });

      // Use RICH schema for application logic (performs cleanup like lowercase + default catches)
      const cleanedIntent = intentSchema.parse(result.output);

      return {
        provider: result.provider,
        intent: cleanedIntent
      };
    } catch (error: any) {
      logger.error({ error: error.message, userQuery }, "Intent classification failed fundamentally, falling back to general_knowledge");
      // SAFE FALLBACK: Never throw 500 for a simple intent failure
      const fallbackIntent: QueryIntent = {
        summary: userQuery,
        operation: "general_knowledge",
        target: "unknown" as any,
        needsSql: false,
        needsVector: true, // Default to vector search if we don't know the intent
        confidence: 0,
        limit: 5,
        timeRange: { preset: "all_time" }
      } as QueryIntent;

      return {
        provider: "nvidia_qwen", // Assumption
        intent: fallbackIntent
      };
    }
  }
}
