import { HumanMessage, AIMessage, BaseMessage } from "@langchain/core/messages";
import { logger } from "../utils/logger.ts";
import type { QueryIntent } from "./query-schemas.ts";
import { intentSchema, intentSchemaRaw } from "./query-schemas.ts";
import type { LlmProvider } from "../llm/provider.ts";

export class IntentService {
  constructor(private readonly llm: LlmProvider) {}

  async classify(tenantId: string, userQuery: string, history: BaseMessage[] = []): Promise<{ provider: "openai" | "nvidia_qwen"; intent: QueryIntent }> {
    try {
      const system = [
        "You classify healthcare analytics queries into a strict schema.",
        "Classify healthcare analytic queries into the provided JSON schema using these core rules:",
        "1. Ground all values (summary, names, metrics) in the user request. No invented identifiers.",
        "2. Operation Mapping: 'book' (for scheduling), 'export_pdf' (for documents), 'lookup' (for slots/tokens/schedules), 'semantic_lookup' (for text search), 'general_knowledge' (greetings, general medical definitions, or common inquiries).",
        "3. Target Mapping: 'appointments', 'patients', 'prescriptions', 'doctors', 'medicines', 'schedules' (for availability/stats).",
        "4. PDF Export: Queries about 'pdf of prescription' or 'print report' MUST use operation='export_pdf' and target='prescriptions'. Extract the patient name into 'patientName'.",
        "5. Mandatory for 'book': requires morning|afternoon|night session. If missing, set needsClarification=true.",
        "6. Date Resolution: Resolve 'today', 'tomorrow', 'next Monday' based on current date: " + new Date().toISOString().split('T')[0] + ".",
        "7. Tokens/Slots: Any query about available tokens or doctor availability ALWAYS uses operation='lookup' and target='schedules'.",
        "8. Handling Greetings and General Questions: Greetings, common talk, or general medical definitions (e.g., 'What is paracetamol?') should be classified as operation='general_knowledge' and target='unknown'.",
        "9. Output ONLY the JSON object."
      ].join(" ");

      const historyContext = history.map(m => `${m._getType()}: ${m.content}`).join("\n");

      const user = JSON.stringify({
        tenant_id: tenantId,
        user_query: userQuery,
        recent_history: historyContext
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
      logger.error({ error: error.message, userQuery }, "Intent classification failed fundamentally, falling back to rule detection");

      const q = userQuery.toLowerCase();
      
      // Robust detection for "doctor" or names
      const isDoctorQuery = q.includes("doctor") || q.includes("dr.") || /\b(dr|doc)\b/i.test(q);
      const isDescriptiveQuery = q.includes("tell me") || q.includes("about") || q.includes("experience") || q.includes("specialty");
      const possibleNameMatch = userQuery.match(/(?:doctor|dr\.)\s+([a-zA-Z\s]+)/i);

      let fallbackIntent: QueryIntent;

      if (isDoctorQuery || isDescriptiveQuery || possibleNameMatch) {
        fallbackIntent = {
          summary: userQuery,
          operation: "semantic_lookup",
          target: "doctors",
          doctorName: possibleNameMatch?.[1]?.trim(),
          needsSql: true,
          needsVector: true, // ALWAYS vector for biographies
          confidence: 0.5,
          limit: 20,
          timeRange: { preset: "all_time" }
        } as QueryIntent;
      } else if (q.includes("appointment")) {
        fallbackIntent = {
          summary: userQuery,
          operation: "lookup",
          target: "appointments",
          needsSql: true,
          needsVector: false,
          confidence: 0.5,
          limit: 20,
          timeRange: { preset: "all_time" }
        } as QueryIntent;
      } else {
        fallbackIntent = {
          summary: userQuery,
          operation: "general_knowledge",
          target: "unknown" as any,
          needsSql: false,
          needsVector: true,
          confidence: 0,
          limit: 20,
          timeRange: { preset: "all_time" }
        } as QueryIntent;
      }

      return {
        provider: "rule_based" as any,
        intent: fallbackIntent
      };
    }
  }
}
