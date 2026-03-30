import { DatabaseClient } from "./src/db/client.ts";
import { loadSchemaMapping } from "./src/db/schema-mapping.ts";
import { IntentService } from "./src/services/intent.service.ts";
import { LlmProvider } from "./src/llm/provider.ts";
import { BookingService } from "./src/services/booking.service.ts";
import { AiQueryService } from "./src/services/ai-query.service.ts";
import { QueryPlannerService } from "./src/services/query-planner.service.ts";
import { SqlBuilderService } from "./src/services/sql-builder.service.ts";
import { SchemaDiscoveryService } from "./src/services/schema-discovery.service.ts";
import { DynamicSqlPlannerService } from "./src/services/dynamic-sql-planner.service.ts";
import { DbExecutorService } from "./src/services/db-executor.service.ts";
import { VectorSearchService } from "./src/services/vector-search.service.ts";
import { ResponseGeneratorService } from "./src/services/response-generator.service.ts";
import { SessionService } from "./src/services/session.service.ts";
import { PdfService } from "./src/services/pdf.service.ts";
import { QdrantService } from "./src/vector/qdrant.ts";

const tenantId = "bc2428a0-604b-45c9-a04b-01e390ccace8";
const userQuery = "give me the pdf of SURIYA D prescription";

async function run() {
  const db = new DatabaseClient();
  const schemaMapping = await loadSchemaMapping();
  const llm = new LlmProvider();
  const qdrant = new QdrantService();
  
  const intentService = new IntentService(llm);
  const planner = new QueryPlannerService();
  const sqlBuilder = new SqlBuilderService(schemaMapping);
  const schemaDiscovery = new SchemaDiscoveryService(db);
  const dynamicSqlPlanner = new DynamicSqlPlannerService(llm);
  const dbExecutor = new DbExecutorService(db);
  const vectorSearch = new VectorSearchService(llm, qdrant);
  const responseGenerator = new ResponseGeneratorService(llm);
  const sessionService = new SessionService();
  const bookingService = new BookingService(db, schemaMapping);
  const pdfService = new PdfService();

  const aiQueryService = new AiQueryService(
    schemaMapping,
    intentService,
    planner,
    sqlBuilder,
    schemaDiscovery,
    dynamicSqlPlanner,
    dbExecutor,
    vectorSearch,
    responseGenerator,
    null,
    sessionService,
    bookingService,
    pdfService
  );

  console.log("--- Testing Classification ---");
  const classified = await intentService.classify(tenantId, userQuery);
  console.log("Intent:", JSON.stringify(classified.intent, null, 2));

  console.log("--- Testing findPatient ---");
  const patient = await bookingService.findPatient(tenantId, "SURIYA D");
  console.log("Patient Found:", patient);

  if (patient) {
     console.log("--- Testing Prescription Query ---");
     const rxTable = schemaMapping.prescriptions.table;
     const p = schemaMapping.patients;
     const d = schemaMapping.doctors;
     const m = schemaMapping.medicines;

     const rxRes = await dbExecutor.execute<any>({
        text: `
            SELECT 
                rx.*,
                CONCAT(p.first_name, ' ', p.last_name) as patient_full_name,
                p.dob, p.gender,
                CONCAT(dr.first_name, ' ', dr.last_name) as doctor_full_name,
                dr.specialist,
                pm.dosage, pm.day as duration, pm.time, pm.comment as med_comment,
                med.name as medicine_name
            FROM ${rxTable} rx
            INNER JOIN ${p.table} p ON p.id = rx.patient_id
            INNER JOIN ${d.table} dr ON dr.id = rx.doctor_id
            LEFT JOIN prescriptions_medicines pm ON pm.prescription_id = rx.id
            LEFT JOIN ${m.table} med ON med.id = pm.medicine
            WHERE rx.tenant_id = ? AND rx.patient_id = ?
            ORDER BY rx.created_at DESC
        `,
        values: [tenantId, patient.id],
        description: "debug_rx"
     });
     console.log("Prescriptions found count:", rxRes.rows.length);
     if (rxRes.rows.length > 0) {
        console.log("First Rx row:", JSON.stringify(rxRes.rows[0], null, 2));
     }
  }

  process.exit(0);
}

run().catch(console.error);
