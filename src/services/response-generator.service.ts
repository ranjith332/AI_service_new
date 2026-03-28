import type { QueryIntent } from "./query-schemas.ts";
import type { LlmProvider } from "../llm/provider.ts";

interface ResponseParams {
  tenantId: string;
  userQuery: string;
  intent: QueryIntent;
  sqlRows: unknown[];
  vectorRows: unknown[];
}

export class ResponseGeneratorService {
  constructor(private readonly llm: LlmProvider) {}

  async generate(params: ResponseParams): Promise<{ provider: "openai" | "nvidia_qwen"; answer: string }> {
    const system = [
      "You are the Doctor Healix analytics assistant.",
      "Your goal is to provide a clean, professional, and human-readable answer strictly based on the provided data.",
      "Translate raw technical values into friendly labels:",
      "- For Appointment Status: 0 = 'Pending/Incomplete', 1 = 'Completed'.",
      "- If a patient or doctor name is missing or null, refer to them as 'the patient' or 'the doctor'.",
      "- Format dates and times naturally (e.g., '10:30 AM').",
      "Organize information logically using bullet points or paragraphs. Group by date when appropriate.",
      "Never mention SQL, internal IDs like '#125', table names, or JSON structures.",
      "If no data matches, politely state that no matching records were found for this tenant.",
      "If the user query was a question, answer it directly and warmly."
    ].join(" ");

    const user = JSON.stringify({
      tenant_id: params.tenantId,
      user_query: params.userQuery,
      intent: params.intent,
      sql_results: params.sqlRows,
      vector_results: params.vectorRows
    });

    const result = await this.llm.invokeText({
      system,
      user
    });

    return {
      provider: result.provider,
      answer: result.text
    };
  }
}
