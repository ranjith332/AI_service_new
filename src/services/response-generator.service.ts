import { LlmProvider } from "../llm/provider.ts";
import { logger } from "../utils/logger.ts";

export class ResponseGeneratorService {
  constructor(private readonly llm: LlmProvider) {}

  async generate(
    query: string,
    data: any,
    intent: any,
    history: string = ""
  ): Promise<string> {
    const prompt = `
You are an AI assistant for a hospital management system.
Your task is to answer the user query strictly based on the intent.

Rules:
* Answer ONLY what the user asked.
* Do NOT include raw tables, database fields, or technical metadata.
* Do NOT display IDs, timestamps, or internal system details.
* Convert database results into a natural, human-readable answer.
* If the query is about a doctor, respond ONLY with relevant information about that doctor.
* Do NOT explain how the data was fetched.
* If a "pdfUrl" is present in the Intent (intent.pdfUrl), you MUST provide a clickable markdown link (e.g. "[Download Prescription PDF](...url...)").
* Do NOT use the fallback "No sufficient information" or "I could not find the prescription" messages if a "pdfUrl" is present.
* Keep the response concise and focused.

If the data provided does not contain a prescription at all AND no "pdfUrl" is generated, respond with:
"I could not find a prescription for that patient. Please ensure the name is correct."

User Query: "${query}"
Data Found: ${JSON.stringify(data.sql)}
Generated PDF: ${intent.pdfUrl || "None"}
History: ${history}

AI Response:
`;

    try {
      const model = this.llm.getFastModel();
      if (!model) throw new Error("No LLM model available");
      
      const response = await model.invoke(prompt);
      return response.content as string;
    } catch (error: any) {
      logger.error({ error: error.message }, "Response generation failed");
      return "I apologize, but I encountered an error while generating your response. Please try again soon.";
    }
  }
}
