import type { BaseMessage } from "@langchain/core/messages";
import type { QueryIntent } from "./query-schemas.ts";
import type { LlmProvider } from "../llm/provider.ts";

interface ResponseParams {
  tenantId: string;
  userQuery: string;
  intent: QueryIntent;
  sqlRows: unknown[];
  vectorRows: unknown[];
  timeZone: string;
  history?: BaseMessage[];
}

export class ResponseGeneratorService {
  constructor(private readonly llm: LlmProvider) {}

  async generate(
    params: ResponseParams
  ): Promise<{ provider: "openai" | "nvidia_qwen"; answer: string }> {
    
    // 🔥 Smaller + cleaner system prompt
    const system = [
      "You are Doctor Healix AI assistant.",
      "Provide clean, professional, human-readable answers. Prioritize given records, but use your own knowledge for general or medical definitions if no data is found.",
      `Today is ${new Date().toLocaleDateString("en-US", {
        timeZone: params.timeZone,
      })}.`,
      "Convert UTC timestamps to local timezone.",
      "Translate values:",
      "0=Pending, 1=Completed, 4=Cancelled.",
      "Never mention SQL, IDs, or JSON.",
      "If no data matches the specific query in the provided records, answer normally from your own knowledge base (especially for general medical terms or definitions).",
    ].join(" ");

    // 🔥 CRAG-lite relevance filter
    const isRelevant = (row: any, query: string) => {
      const text = JSON.stringify(row).toLowerCase();
      return query
        .toLowerCase()
        .split(" ")
        .some((word) => text.includes(word));
    };

    const sanitizeData = (rows: any[] | undefined, query: string) => {
      if (!rows || !Array.isArray(rows)) return [];

      return rows
        .filter((r) => isRelevant(r, query)) // CRAG filter
        .slice(0, 20) // HIGHER LIMIT: 20 rows
        .map((row) => {
          const clean: Record<string, any> = {};
          let count = 0;

          for (const key in row) {
            if (count >= 20) break; // HIGHER LIMIT: 20 fields

            const val = row[key];

            if (key.startsWith("_")) continue;
            if (val === null || val === undefined) continue;

            if (typeof val === "string") {
              clean[key] =
                val.length > 1000
                  ? val.substring(0, 1000) + "... [clipped]"
                  : val;
            } else {
              clean[key] = val;
            }

            count++;
          }

          return clean;
        });
    };

    const toTextFormat = (rows: any[] | undefined, label: string) => {
      if (!rows || rows.length === 0) return `${label}: No direct records found.`;
      
      return `${label}:\n` + rows.map((row, i) => {
        const parts = Object.entries(row)
          .map(([k, v]) => `${k}: ${v}`)
          .join(" | ");
        return `* Row ${i+1}: ${parts}`;
      }).join("\n");
    };

    const safeSQLRows = sanitizeData(params.sqlRows, params.userQuery);
    const safeVectorRows = sanitizeData(params.vectorRows, params.userQuery).slice(0, 10);

    const sqlText = toTextFormat(safeSQLRows, "DATABASE_RESULTS");
    const vectorText = toTextFormat(safeVectorRows, "KNOWLEDGE_BASE_RESULTS");

    const historyContext = params.history?.map(m => `${m._getType()}: ${m.content}`).join("\n") || "No history.";

    // 🔥 Absolute stable text format instead of complex JSON
    const userPayload = [
      `USER_QUERY: ${params.userQuery}`,
      `RECENT_HISTORY: ${historyContext}`,
      `INTENT: ${params.intent.summary || "no summary"}`,
      `TIMEZONE: ${params.timeZone}`,
      `TENANT_ID: ${params.tenantId}`,
      "",
      sqlText,
      "",
      vectorText
    ].join("\n");

    try {
      const result = await this.llm.invokeText({
        system,
        user: userPayload,
      });

      return {
        provider: result.provider,
        answer: result.text,
      };
    } catch (error: any) {
      console.error("LLM PRIMARY FAILED. Reason:", error.message);

      // Robust fallback: if SQL data is available, format it manually
      if (safeSQLRows.length > 0) {
        return {
          provider: "openai", // Mark as fallback
          answer: this.formatDataFallback(safeSQLRows, params.intent.target || "system")
        };
      }

      // Final fallback for extreme stability
      return {
        provider: "openai",
        answer: "I encountered a technical issue while processing the records. Please try asking again in a simpler way or check back in a moment.",
      };
    }
  }

  private formatDataFallback(rows: any[], target: string): string {
    const intro = `The natural language service is temporarily unavailable, but I have retrieved the following ${target} record(s) for you from the system:\n\n`;
    
    const formattedRows = rows.map((row, index) => {
      const details = Object.entries(row)
        .filter(([k]) => !k.startsWith("_") && k !== "id" && k !== "tenant_id")
        .map(([k, v]) => {
          // Clean up key name
          const displayKey = k.split("_").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
          return `* **${displayKey}**: ${v}`;
        })
        .join("\n");
      
      return `### Record ${index + 1}\n${details}`;
    }).join("\n\n");

    return intro + formattedRows + "\n\n(Note: This is a direct record summary. You can try asking again in a moment for a conversational answer.)";
  }
}
