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
        "You classify healthcare queries into structured JSON.",
        "If the query contains 'how many', 'count', or 'total', set operation='aggregate' and metric='count'.",
        "For aggregation queries, extract all entities into 'targets' (patients, doctors, appointments, prescriptions, medicines).",
        "Extract filters like date (today, yesterday), status (completed, pending), department, and experience.",
        "Store filters inside a 'filters' object with fields like date, status, department, minExperience.",
        "For aggregation queries, set needsSql=true and needsVector=false.",
        "If the query is about meaning, description, or 'tell me about Dr. X', use operation='semantic_lookup' and needsVector=true.",
        "DO NOT extract names (doctorName/patientName) for aggregation queries.",
        "Always return valid JSON strictly matching the schema, no extra text.",
        "Example: 'today completed appointments count' → { \"operation\": \"aggregate\", \"targets\": [\"appointments\"], \"metric\": \"count\", \"filters\": { \"date\": \"today\", \"status\": \"completed\" } }",
        "Example: 'How many doctors have >5 years experience?' → { \"operation\": \"aggregate\", \"targets\": [\"doctors\"], \"metric\": \"count\", \"filters\": { \"minExperience\": 5 } }",
        "Core Classification Rules:",
        "1. Operation Mapping: 'book' (scheduling), 'export_pdf' (documents), 'lookup' (slots/availability), 'semantic_lookup', 'general_knowledge'.",
        "2. PDF Export: Queries about 'pdf of prescription' MUST use operation='export_pdf' and target='prescriptions'.",
        "3. Output ONLY JSON."
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
      
      const targets = this.extractTargets(q);
      const target = targets.length === 1 ? (targets[0] as any) : targets.length > 1 ? "unknown" as any : "unknown" as any;

      // Robust detection for "doctor" or names
      const isDoctorQuery = q.includes("doctor") || q.includes("dr.") || /\b(dr|doc)\b/i.test(q);
      const isDescriptiveQuery = q.includes("tell me") || q.includes("about") || q.includes("experience") || q.includes("specialty");
      const possibleNameMatch = userQuery.match(/(?:doctor|dr\.)\s+([a-zA-Z\s]+)/i);

      let fallbackIntent: QueryIntent;

      if (q.includes("count") || q.includes("how many") || q.includes("total")) {
        fallbackIntent = intentSchema.parse({
          summary: userQuery,
          operation: "aggregate",
          targets: [
            q.includes("patient") ? "patients" : null,
            q.includes("doctor") ? "doctors" : null
          ].filter(Boolean),
          metric: "count",
          needsSql: true,
          needsVector: false,
          confidence: 0.6,
          limit: 20,
          timeRange: { preset: "all_time" }
        });
      } else if (isDoctorQuery || isDescriptiveQuery || possibleNameMatch) {
        // If it's descriptive but NOT about doctors (e.g., "about paracetamol"), 
        // use the detected target instead of forcing 'doctors'
        const effectiveTarget = targets.includes("doctors") || (!targets.includes("medicines") && !targets.includes("patients")) ? "doctors" : targets[0];
        
        fallbackIntent = intentSchema.parse({
          summary: userQuery,
          operation: "semantic_lookup",
          target: targets.length > 1 ? "unknown" : effectiveTarget,
          targets,
          doctorName: possibleNameMatch?.[1]?.trim(),
          needsSql: true,
          needsVector: true, // ALWAYS vector for biographies
          confidence: 0.5,
        });
      } else if (q.includes("appointment")) {
        fallbackIntent = intentSchema.parse({
          summary: userQuery,
          operation: "lookup",
          target: targets.length > 1 ? "unknown" : "appointments",
          targets,
          needsSql: true,
          needsVector: false,
          confidence: 0.5,
        });
      } else {
        fallbackIntent = intentSchema.parse({
          summary: userQuery,
          operation: "general_knowledge",
          target: targets.length > 1 ? "unknown" : (targets[0] || "unknown"),
          targets,
          needsSql: false,
          needsVector: true,
          confidence: 0,
        });
      }

      return {
        provider: "rule_based" as any,
        intent: fallbackIntent
      };
    }
  }

  private extractTargets(query: string): string[] {
    const q = query.toLowerCase();
    const targetMap: Record<string, string[]> = {
      patients: ["patient"],
      doctors: ["doctor", "dr.", "specialist"],
      appointments: ["appointment"],
      prescriptions: ["prescription", "report"],
      medicines: ["medicine", "paracetamol", "pill"],
      dependents: ["dependent"],
      schedules: ["schedule", "slot", "token"]
    };

    const found: string[] = [];
    for (const [target, keywords] of Object.entries(targetMap)) {
      if (keywords.some(k => q.includes(k))) {
        found.push(target);
      }
    }
    return found;
  }
}
