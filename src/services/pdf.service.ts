import { logger } from "../utils/logger.ts";
import { DatabaseClient, type SqlQuery } from "../db/client.ts";
import PDFDocument from "pdfkit";
import fs from "node:fs";
import path from "node:path";

export class PdfService {
  constructor(private readonly db: DatabaseClient) {}

  async generatePrescriptionPdf(prescriptionId: number, tenantId: string): Promise<string> {
    logger.info({ prescriptionId, tenantId }, "Generating professional prescription PDF");

    // 1. Fetch Prescription Details (Try common table names)
    let prescription: any = null;
    const tableCandidates = ["prescriptions", "opd_prescriptions", "ipd_prescriptions"];
    
    for (const table of tableCandidates) {
      try {
        const query: SqlQuery = {
          text: `
            SELECT 
              p.*,
              pt.first_name as patient_first_name, pt.last_name as patient_last_name, pt.gender as patient_gender, pt.dob as patient_dob,
              d.*, d.first_name as doctor_first_name, d.last_name as doctor_last_name
            FROM ${table} p
            JOIN patients pt ON pt.id = p.patient_id
            JOIN doctors d ON d.id = p.doctor_id
            WHERE p.id = ? AND p.tenant_id = ?
          `,
          values: [prescriptionId, tenantId],
        };
        const result = await this.db.query(query);
        if (result.rowCount > 0) {
          prescription = result.rows[0];
          break;
        }
      } catch (e) {
        // Continue to next table candidate
      }
    }

    if (!prescription) {
      throw new Error(`Prescription ${prescriptionId} not found in any supported tables.`);
    }

    // 2. Fetch Medicines (Try common item table names)
    let medicines: any[] = [];
    const itemTableCandidates = ["prescription_medicines", "prescription_items", "opd_prescription_items", "ipd_prescription_items"];
    
    for (const table of itemTableCandidates) {
      try {
        const medQuery: SqlQuery = {
          text: `SELECT * FROM ${table} WHERE prescription_id = ?`,
          values: [prescriptionId],
        };
        const medResult = await this.db.query(medQuery);
        if (medResult.rowCount > 0 || medResult.rows.length > 0) {
          medicines = medResult.rows;
          break;
        }
      } catch (e) {
        // Continue
      }
    }

    // 3. Setup File Path
    const storagePath = path.join(process.cwd(), "storage", "prescriptions", tenantId.toString());
    if (!fs.existsSync(storagePath)) {
      fs.mkdirSync(storagePath, { recursive: true });
    }
    const fileName = `${prescriptionId}.pdf`;
    const filePath = path.join(storagePath, fileName);

    // 4. Generate PDF
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50 });
        const stream = fs.createWriteStream(filePath);

        doc.pipe(stream);

        const data = prescription;

        // Header
        doc.font("Helvetica-Bold").fontSize(20).text("DOCTOR HEALIX HOSPITAL", { align: "center" });
        doc.font("Helvetica").fontSize(10).text("Precision Medical Care & AI Assistance", { align: "center" });
        doc.moveDown();
        doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown();

        // Doctor Info (Right Side)
        doc.font("Helvetica-Bold").fontSize(12).text(`Dr. ${data.doctor_first_name} ${data.doctor_last_name}`, { align: "right" });
        const spec = data.specialist || data.speciality || data.specialty || data.doctor_speciality || "General Physician";
        doc.font("Helvetica").fontSize(10).text(`${spec}`, { align: "right" });
        doc.moveDown();

        // Patient Info
        doc.font("Helvetica-Bold").fontSize(12).text("PATIENT INFORMATION", { underline: true });
        doc.font("Helvetica").fontSize(10).text(`Name: ${data.patient_first_name} ${data.patient_last_name}`);
        doc.text(`Gender: ${data.patient_gender || "N/A"} | Date of Birth: ${data.patient_dob || "N/A"}`);
        const dateStr = data.created_at ? new Date(data.created_at).toLocaleDateString() : new Date().toLocaleDateString();
        doc.text(`Date: ${dateStr}`);
        doc.moveDown();

        // Diagnosis / Problem
        const problem = data.problem || data.diagnosis || data.chief_complaint || "";
        if (problem) {
          doc.font("Helvetica-Bold").fontSize(12).text("DIAGNOSIS / CHIEF COMPLAINT", { underline: true });
          doc.font("Helvetica").fontSize(10).text(problem);
          doc.moveDown();
        }

        // RX Section (Medicines)
        doc.font("Helvetica-Bold").fontSize(14).text("RX / MEDICATIONS", { underline: true });
        doc.moveDown(0.5);

        if (medicines.length > 0) {
          medicines.forEach((med: any, index: number) => {
            const medName = med.medicine_name || med.name || med.item_name || "Unknown Medicine";
            doc.font("Helvetica-Bold").fontSize(10).text(`${index + 1}. ${medName}`);
            const dosage = med.dosage || med.dose || "As directed";
            const duration = med.duration || "N/A";
            const time = med.time || med.timing || "N/A";
            doc.font("Helvetica").text(`   Dosage: ${dosage} | Duration: ${duration} | Time: ${time}`);
            if (med.comment || med.note) doc.text(`   Note: ${med.comment || med.note}`, { oblique: true });
            doc.moveDown(0.5);
          });
        } else {
          doc.font("Helvetica").fontSize(10).text("No medications listed.");
        }

        doc.moveDown();

        // Advice / Tests
        const advice = data.advice || data.note || "";
        const tests = data.test || data.investigation || "";
        if (tests || advice) {
          doc.font("Helvetica-Bold").fontSize(12).text("ADVICE & TESTS", { underline: true });
          doc.font("Helvetica");
          if (tests) doc.fontSize(10).text(`Tests: ${tests}`);
          if (advice) doc.fontSize(10).text(`Advice: ${advice}`);
          doc.moveDown();
        }

        // Footer
        doc.moveTo(50, 700).lineTo(550, 700).stroke();
        doc.font("Helvetica").fontSize(8).text("This is a computer-generated prescription from Doctor Healix AI Service.", 50, 710, { align: "center" });

        doc.end();

        stream.on("finish", () => {
          const publicUrl = `/storage/prescriptions/${tenantId}/${fileName}`;
          logger.info({ filePath, publicUrl }, "PDF generated successfully");
          resolve(publicUrl);
        });

        stream.on("error", (err) => {
          logger.error({ err }, "Stream error during PDF generation");
          reject(err);
        });
      } catch (err) {
        logger.error({ err }, "Unexpected error in PDF generation");
        reject(err);
      }
    });
  }
}
