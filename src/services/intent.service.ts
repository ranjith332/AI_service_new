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
      "Use needsVector=true for semantic search over free-text clinical content.",
      "Use needsSql=true for counts, lists, latest records, names, joins, billing, appointments, or aggregations.",
      "The result MUST be a flat JSON object with these exact keys: summary (string), operation (list|aggregate|latest|lookup|semantic_lookup|summary|book), target (appointments|patients|prescriptions|doctors|medicines|users|dependents|schedules|scheduledays|doctorholidays|doctorsessions|unknown), patientName (string|null), doctorName (string|null), condition (string|null), metric (none|revenue|appointment_count|doctor_with_most_appointments), timeRange (object with preset: today|yesterday|this_week|this_month|all_time|latest|custom), limit (number), needsSql (boolean), needsVector (boolean), sort (latest|oldest|highest|lowest), needsClarification (boolean), clarificationMessage (string|null), bookingDetails (object with name, doctor, session: morning|afternoon|night|none, token: number|null, appointmentDate: ISO string|null), confidence (number).",
      "CRITICAL: If the user says 'Book', 'Appointment for', 'Put an appointment', or 'Schedule for [Name]', ALWAYS use operation='book'. Do NOT use 'lookup' or 'list' for these phrases.",
      "For 'book' operation: capture the primary entity name in bookingDetails.name. If the user provided a name but you are not 100% sure if they are a patient or dependent, set needsClarification=false but fill the bookingDetails.name so the backend can verify it.",
      "If the date/time is missing for a booking, assume 'today' or 'next available' but set needsClarification=true if you need the user to pick a specific session.",
      "Recognize family queries (e.g., 'my daughter', 'my father') as targets for 'dependents' or joins with 'appointments'.",
      "Do NOT use 'hybrid' as a target. Use a real table name or 'unknown'.",
      "CRITICAL: Return ONLY the flat JSON object. No conversational filler."
    ].join(" ");

    const user = JSON.stringify({
      tenant_id: tenantId,
      user_query: userQuery
    });

    const result = await this.llm.invokeStructured(intentSchema, {
      system,
      user,
      schemaName: "DoctorHealixIntent",
      useFastModel: true
    });

    return {
      provider: result.provider,
      intent: result.output
    };
  }
}
