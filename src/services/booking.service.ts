import { DatabaseClient, type SqlQuery } from "../db/client.ts";
import { logger } from "../utils/logger.ts";
import { BadRequestError } from "../utils/errors.ts";
import dayjs from "dayjs-ext";

export class BookingService {
  constructor(private readonly db: DatabaseClient) {}

  async validateAndBook(params: {
    patientName?: string;
    doctorName?: string;
    date?: string;
    tenantId: string;
  }) {
    logger.info({ params }, "Validating booking request");

    // 1. Find Patient
    let patientId: number | null = null;
    if (params.patientName) {
      const patientQuery: SqlQuery = {
        text: "SELECT id FROM patients WHERE (first_name LIKE ? OR last_name LIKE ?) AND tenant_id = ?",
        values: [`%${params.patientName}%`, `%${params.patientName}%`, params.tenantId],
      };
      const patients = await this.db.query(patientQuery);
      if (patients.rows && patients.rows.length > 0) {
        patientId = patients.rows[0].id;
      }
    }

    // 2. Find Doctor
    let doctorId: number | null = null;
    if (params.doctorName) {
      const doctorQuery: SqlQuery = {
        text: "SELECT id FROM doctors WHERE (first_name LIKE ? OR last_name LIKE ?) AND tenant_id = ?",
        values: [`%${params.doctorName}%`, `%${params.doctorName}%`, params.tenantId],
      };
      const doctors = await this.db.query(doctorQuery);
      if (doctors.rows && doctors.rows.length > 0) {
        doctorId = doctors.rows[0].id;
      }
    }

    if (!patientId || !doctorId) {
      throw new BadRequestError("Could not find patient or doctor for booking");
    }

    // 3. Create Appointment
    const scheduledAt = params.date ? dayjs(params.date).toDate() : dayjs().add(1, "day").toDate();
    const bookQuery: SqlQuery = {
      text: "INSERT INTO appointments (tenant_id, patient_id, doctor_id, scheduled_at, status) VALUES (?, ?, ?, ?, ?)",
      values: [params.tenantId, patientId, doctorId, scheduledAt, 0],
    };

    const result = await this.db.query(bookQuery);
    
    logger.info({ appointmentId: (result as any).insertId }, "Appointment booked successfully");
    
    return {
      success: true,
      message: "Appointment booked successfully",
      appointmentId: (result as any).insertId,
      scheduledAt,
    };
  }
}
