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

* If no data is found in data.sql and no vector results are present, politely inform the user that you couldn't find any information matching their request for the specific entity (e.g. "I couldn't find any patients matching...").
* Use the target entities from the intent: ${JSON.stringify(intent.targets)} to formulate your response.

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
