import PDFDocument from "pdfkit";
import { logger } from "../utils/logger.ts";

export interface PrescriptionData {
    id: number;
    patientName: string;
    patientAge?: number;
    patientGender?: string;
    doctorName: string;
    doctorSpeciality?: string;
    date: string;
    problem?: string;
    test?: string;
    advice?: string;
    nextVisit?: string;
    medicines: Array<{
        name: string;
        dosage: string;
        duration: string;
        time: string;
        comment?: string;
    }>;
}

export class PdfService {
    async generatePrescriptionPdf(data: PrescriptionData): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            const doc = new PDFDocument({ margin: 50 });
            const buffers: Buffer[] = [];

            doc.on("data", (chunk) => buffers.push(chunk));
            doc.on("end", () => resolve(Buffer.concat(buffers)));
            doc.on("error", (err) => reject(err));

            // Header - Hospital Branding
            doc.fillColor("#444444")
               .fontSize(20)
               .text("DOCTOR HEALIX HMS", 110, 50)
               .fontSize(10)
               .text("Advanced Healthcare Management System", 110, 80)
               .text("123 Healthcare Blvd, Medical City", 110, 95)
               .moveDown();

            // Divider
            doc.moveTo(50, 115).lineTo(550, 115).strokeColor("#eeeeee").stroke();

            // Patient & Doctor Info
            doc.fontSize(12).fillColor("#000000");
            doc.text(`Patient: ${data.patientName}`, 50, 130);
            if (data.patientAge) doc.text(`Age: ${data.patientAge}`, 50, 145);
            if (data.patientGender) doc.text(`Gender: ${data.patientGender}`, 50, 160);

            doc.text(`Doctor: ${data.doctorName}`, 350, 130);
            if (data.doctorSpeciality) doc.text(`Speciality: ${data.doctorSpeciality}`, 350, 145);
            doc.text(`Date: ${data.date}`, 350, 160);

            // Clinical Section
            doc.moveDown(2);
            doc.fontSize(14).fillColor("#2c3e50").text("Clinical Findings", { underline: true });
            doc.moveDown(0.5);
            doc.fontSize(10).fillColor("#333333");
            if (data.problem) doc.text(`Problem: ${data.problem}`);
            if (data.test) doc.text(`Recommended Tests: ${data.test}`);
            
            // Medicines Table
            doc.moveDown(2);
            doc.fontSize(14).fillColor("#2c3e50").text("Prescribed Medicines", { underline: true });
            doc.moveDown(1);

            // Table Header
            const tableTop = doc.y;
            doc.fontSize(10).fillColor("#000000");
            doc.text("Medicine Name", 50, tableTop, { width: 200 });
            doc.text("Dosage", 250, tableTop, { width: 100 });
            doc.text("Duration", 350, tableTop, { width: 100 });
            doc.text("Instruction", 450, tableTop, { width: 100 });

            doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).strokeColor("#dddddd").stroke();

            let currentY = tableTop + 25;
            data.medicines.forEach((med) => {
                doc.text(med.name, 50, currentY, { width: 200 });
                doc.text(med.dosage, 250, currentY, { width: 100 });
                doc.text(med.duration, 350, currentY, { width: 100 });
                doc.text(med.time, 450, currentY, { width: 100 });
                currentY += 20;
            });

            // Advice Section
            if (data.advice) {
                doc.moveDown(2);
                doc.fontSize(14).fillColor("#2c3e50").text("Advice & Instructions", { underline: true });
                doc.moveDown(0.5);
                doc.fontSize(10).fillColor("#333333").text(data.advice);
            }

            if (data.nextVisit) {
                doc.moveDown(1);
                doc.fontSize(10).fillColor("#e74c3c").font("Helvetica-Bold").text(`Next Visit: ${data.nextVisit}`);
                doc.font("Helvetica");
            }

            // Footer
            const footerY = 750;
            doc.moveTo(50, footerY).lineTo(550, footerY).strokeColor("#eeeeee").stroke();
            doc.fontSize(8).fillColor("#aaaaaa")
               .text("This is an electronically generated document. No signature is required.", 50, footerY + 10, { align: "center" });

            doc.end();
            logger.info({ prescriptionId: data.id }, "PDF generation complete");
        });
    }
}
