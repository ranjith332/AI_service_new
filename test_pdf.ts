import { PdfService } from "./src/services/pdf.service.ts";
import fs from "fs";

async function testPdf() {
    const pdf = new PdfService();
    const buffer = await pdf.generatePrescriptionPdf({
        id: 1,
        patientName: "Ravi Kumar",
        patientAge: 30,
        patientGender: "Male",
        doctorName: "Dr. Raju Boy",
        doctorSpeciality: "General Physician",
        date: "2026-03-28",
        problem: "Severe headache and fever.",
        test: "Blood Test, X-Ray",
        advice: "Take rest and drink plenty of water.",
        nextVisit: "After 5 days",
        medicines: [
            { name: "Paracetamol", dosage: "500mg", duration: "3 days", time: "1-0-1", comment: "After food" },
            { name: "Amoxicillin", dosage: "250mg", duration: "5 days", time: "1-1-1", comment: "Before food" }
        ]
    });
    
    fs.writeFileSync("test_prescription.pdf", buffer);
    console.log("Test PDF generated: test_prescription.pdf");
}

testPdf().catch(console.error);
