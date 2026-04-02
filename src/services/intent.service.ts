import { LlmProvider } from "../llm/provider.ts";
import { QueryIntentSchema, type QueryIntent } from "./query-schemas.ts";
import { logger } from "../utils/logger.ts";

export class IntentService {
  constructor(private readonly llm: LlmProvider) {}

  async classify(query: string, history: string = ""): Promise<QueryIntent> {
    const prompt = `
You are an AI assistant for a healthcare system. Your job is to classify user queries into structured JSON.

OPERATIONS:
* "aggregate" -> for count, total, how many, no of, number of
* "list" -> for multiple records (show, get, fetch, list)
* "lookup" -> for specific person details (doctor/patient name)
* "semantic_lookup" -> for meaning, explanation, bio ("who is", "tell me about", "explain")
* "book" -> for booking appointments
* "export_pdf" -> for exporting prescriptions as PDF

TARGETS: "patients", "doctors", "appointments", "prescriptions".

EXAMPLES:
Query: "give me 20 patients name list?"
Output: {"operation": "list", "targets": ["patients"], "filters": {"limit": 20}}

Query: "who is dr ravi?"
Output: {"operation": "semantic_lookup", "targets": ["doctors"], "filters": {"doctorName": "Ravi"}}

Query: "how many appointments for doctor raju boy in last week?"
Output: {"operation": "aggregate", "targets": ["appointments"], "filters": {"doctorName": "Raju Boy", "date": "last week"}}

User Query: "${query}"
History: ${history}

IMPORTANT: Keep multi-word names together for the primary entity mentioned (e.g. if the user says "doctor Raju Boy", the doctorName is "Raju Boy", NOT doctorName: Raju, patientName: Boy).
your output MUST follow this JSON structure:
{
  "operation": "...",
  "targets": ["..."],
  "filters": {
     "limit": number,
     "doctorName": "...",
     "patientName": "...",
     "date": "...",
     "status": "..."
  }
}
`;

    try {
      const intent = await this.llm.invokeWithStructuredOutput<QueryIntent>(
        prompt,
        QueryIntentSchema
      );
      
      // LOG EVERYTHING FOR FINAL DIAGNOSTICS
      logger.info({ 
        intent,
        originalQuery: query,
        hasPatientWord: query.toLowerCase().includes("patient")
      }, "🔍 RAW INTENT FROM LLM");

      // FORCED OVERRIDE: The "Safe-Guard"
      const lowerQuery = query.toLowerCase();
      const isCountQuery = lowerQuery.includes("how many") || lowerQuery.includes("count") || lowerQuery.includes("total") || lowerQuery.includes("number of") || lowerQuery.includes("no of");

      const filters = intent.filters as any;
      if (!filters.patientName) {
        filters.patientName = filters.prescriptionFor || filters.name || filters.patient_name || filters.patient;
        delete filters.prescriptionFor;
        delete filters.name;
        delete filters.patient_name;
        delete filters.patient;
      }

      const isPdfRequest = lowerQuery.includes("pdf") || lowerQuery.includes("download") || lowerQuery.includes("export") || lowerQuery.includes("print");
      
      if (isPdfRequest) {
        logger.info("Detected PDF request, forcing export_pdf operation.");
        intent.operation = "export_pdf";
        if (!intent.targets?.includes("prescriptions")) {
          intent.targets = ["prescriptions", ...(intent.targets || [])];
        }
      }

      if (lowerQuery.includes("patient") && !intent.targets?.includes("patients")) {
        logger.warn("Forcing 'patients' target based on query keyword.");
        intent.targets = [...(intent.targets || []), "patients"];
        if (!intent.operation || (intent.operation === "aggregate" && !isCountQuery)) {
           intent.operation = "list";
        }
      } else if (lowerQuery.includes("doctor") && !intent.targets?.includes("doctors")) {
        logger.warn("Forcing 'doctors' target based on query keyword.");
        intent.targets = [...(intent.targets || []), "doctors"];
      } else if (lowerQuery.includes("prescription") && !intent.targets?.includes("prescriptions")) {
        intent.targets = [...(intent.targets || []), "prescriptions"];
      }

      return intent;
    } catch (error: any) {
      logger.error({ error: error.message, query }, "Intent classification failed");
      throw error;
    }
  }
}
