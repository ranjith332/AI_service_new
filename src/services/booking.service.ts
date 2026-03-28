import type { DatabaseClient } from "../db/client.ts";
import type { SchemaMapping } from "../db/schema-mapping.ts";
import { UnsupportedQueryError } from "../utils/errors.ts";
import { logger } from "../utils/logger.ts";

export interface BookingParams {
  tenantId: string;
  name: string;
  doctorName: string;
  session: "morning" | "afternoon" | "night";
  token?: number;
  date: string; // ISO Date YYYY-MM-DD
}

export class BookingService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly schema: SchemaMapping
  ) {}

  async validateAndBook(params: BookingParams): Promise<{ success: boolean; message: string; appointmentId?: number; needsIdentity?: boolean }> {
    // 1. Find Identity (Patient or Dependent)
    let patientId: number | undefined;
    let dependentId: number | undefined;

    const patient = await this.findPatient(params.tenantId, params.name);
    if (patient) {
        patientId = patient.id;
    } else {
        // Try to find if they are a USER but not a patient yet
        const user = await this.findUser(params.tenantId, params.name);
        if (user) {
            patientId = await this.promoteUserToPatient(params.tenantId, user);
        } else {
            const dependent = await this.findDependent(params.tenantId, params.name);
            if (dependent) {
                dependentId = dependent.id;
                patientId = dependent.patientId;
            }
        }
    }

    if (!patientId) {
      return { 
        success: false, 
        needsIdentity: true,
        message: `I couldn't find a patient or dependent named '${params.name}'. Whom do you want to put the appointment for?` 
      };
    }

    // 2. Find Doctor
    const doctor = await this.findDoctor(params.tenantId, params.doctorName);
    if (!doctor) {
      return { success: false, message: `Doctor '${params.doctorName}' not found.` };
    }

    // 3. Check Holidays
    const isHoliday = await this.checkHoliday(params.tenantId, doctor.id, params.date);
    if (isHoliday) {
      return { success: false, message: `Dr. ${params.doctorName} is on holiday on ${params.date}.` };
    }

    // 4. Check Schedule & Capacity
    const capacity = await this.checkCapacity(params.tenantId, doctor.id, params.date, params.session);
    if (!capacity.available) {
      return { success: false, message: `No slots available for ${params.session} session on ${params.date}.` };
    }

    // 5. Check Token if provided
    if (params.token && (params.token > capacity.maxTokens || params.token < 1)) {
        return { success: false, message: `Invalid token number ${params.token}. Max allowed is ${capacity.maxTokens}.` };
    }

    // 6. Final Booking (INSERT)
    try {
      const appointmentId = await this.createAppointment(params.tenantId, patientId, doctor.id, params, dependentId);
      return {
        success: true,
        message: `Appointment successfully booked for ${params.name} with Dr. ${params.doctorName} on ${params.date} (${params.session} session).`,
        appointmentId
      };
    } catch (error) {
      logger.error({ error, params }, "Failed to create appointment");
      return { success: false, message: "A database error occurred while booking. Please try again." };
    }
  }

  private async findPatient(tenantId: string, name: string) {
    const p = this.schema.patients;
    const u = this.schema.users;
    // Join with users table as names are often stored there
    const res = await this.db.query<{ id: number }>({
      text: `
        SELECT p.${p.id} AS id 
        FROM ${p.table} p
        INNER JOIN ${u.table} u ON u.${u.id} = p.${p.user}
        WHERE p.${p.tenant} = ? 
          AND (LOWER(u.${u.firstName}) LIKE ? OR LOWER(u.${u.lastName}) LIKE ? OR LOWER(p.${p.firstName}) LIKE ? OR LOWER(p.${p.lastName}) LIKE ?)
        LIMIT 1
      `,
      values: [tenantId, `%${name.toLowerCase()}%`, `%${name.toLowerCase()}%`, `%${name.toLowerCase()}%`, `%${name.toLowerCase()}%`],
      description: "find_patient_joined"
    });
    return res.rows[0];
  }

  private async findUser(tenantId: string, name: string) {
    const u = this.schema.users;
    const res = await this.db.query<{ id: number, email: string, firstName: string, lastName: string }>({
      text: `SELECT ${u.id} AS id, ${u.email} AS email, ${u.firstName} AS firstName, ${u.lastName} AS lastName FROM ${u.table} WHERE ${u.tenant} = ? AND (LOWER(${u.firstName}) LIKE ? OR LOWER(${u.lastName}) LIKE ?) LIMIT 1`,
      values: [tenantId, `%${name.toLowerCase()}%`, `%${name.toLowerCase()}%`],
      description: "find_user"
    });
    return res.rows[0];
  }

  private async promoteUserToPatient(tenantId: string, user: { id: number, email: string, firstName: string, lastName: string }) {
    const p = this.schema.patients;
    const uniqueId = `P-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    
    logger.info({ userId: user.id, tenantId }, "Promoting user to patient");
    
    const res = await this.db.query<{ insertId: number }>({
        text: `
            INSERT INTO ${p.table} (${p.user}, ${p.tenant}, ${p.patientUniqueId}, ${p.email}, ${p.firstName}, ${p.lastName}, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
        `,
        values: [user.id, tenantId, uniqueId, user.email, user.firstName, user.lastName],
        description: "promote_user"
    });
    
    return res.rows[0]?.insertId;
  }

  private async findDoctor(tenantId: string, name: string) {
    const s = this.schema.doctors;
    const res = await this.db.query<{ id: number }>({
      text: `SELECT ${s.id} AS id FROM ${s.table} WHERE ${s.tenant} = ? AND (LOWER(${s.firstName}) LIKE ? OR LOWER(${s.lastName}) LIKE ?) LIMIT 1`,
      values: [tenantId, `%${name.toLowerCase()}%`, `%${name.toLowerCase()}%`],
      description: "find_doctor"
    });
    return res.rows[0];
  }

  private async findDependent(tenantId: string, name: string) {
    const d = this.schema.dependents;
    const p = this.schema.patients;
    // Join with patients to respect tenant_id
    const res = await this.db.query<{ id: number, patientId: number }>({
      text: `
        SELECT d.${d.id} AS id, p.${p.id} AS patientId 
        FROM ${d.table} d
        INNER JOIN ${p.table} p ON p.${p.id} = d.${d.patient}
        WHERE p.${p.tenant} = ? 
          AND (LOWER(d.${d.firstName}) LIKE ? OR LOWER(d.${d.lastName}) LIKE ?)
        LIMIT 1
      `,
      values: [tenantId, `%${name.toLowerCase()}%`, `%${name.toLowerCase()}%`],
      description: "find_dependent"
    });
    return res.rows[0];
  }

  private async checkHoliday(tenantId: string, doctorId: number, date: string) {
    const s = this.schema.doctorHolidays;
    const res = await this.db.query({
      text: `SELECT ${s.id} FROM ${s.table} WHERE ${s.tenant} = ? AND ${s.doctor} = ? AND ${s.date} = ? LIMIT 1`,
      values: [tenantId, doctorId, date],
      description: "check_holiday"
    });
    return res.rows.length > 0;
  }

  private async checkCapacity(tenantId: string, doctorId: number, date: string, session: string) {
    const s = this.schema.scheduleDays;
    const dayOfWeek = new Date(date).getDay(); // 0=Sun, 1=Mon, etc.
    const dayName = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][dayOfWeek];

    const res = await this.db.query<any>({
      text: `
        SELECT sd.* 
        FROM ${s.table} sd
        INNER JOIN ${this.schema.schedules.table} s ON s.id = sd.${s.schedule}
        WHERE s.${this.schema.schedules.tenant} = ? 
          AND s.${this.schema.schedules.doctor} = ? 
          AND sd.${s.availableOn} = ?
        LIMIT 1
      `,
      values: [tenantId, doctorId, dayName],
      description: "check_capacity"
    });

    if (res.rows.length === 0) return { available: false, maxTokens: 0 };

    const row = res.rows[0];
    let maxTokens = 0;
    if (session === "morning") maxTokens = row[s.morningTokens] || 0;
    else if (session === "afternoon") maxTokens = row[s.afternoonTokens] || 0;
    else if (session === "night") maxTokens = row[s.nightTokens] || 0;

    // In a real app, we'd count existing tokens for this day/session here.
    // For now, assume if capacity > 0 and session exists, it's ok.
    return { available: maxTokens > 0, maxTokens };
  }

  private async createAppointment(tenantId: string, patientId: number, doctorId: number, params: BookingParams, dependentId?: number) {
    const s = this.schema.appointments;
    const res = await this.db.query<{ insertId: number }>({
      text: `
        INSERT INTO ${s.table} (
          ${s.tenant}, ${s.patient}, ${s.doctor}, ${s.dependent}, 
          ${s.scheduledAt}, ${s.tokenNumber}, ${s.isCompleted}, 
          ${s.patientName}, ${s.createdAt}, ${s.updatedAt}
        )
        VALUES (?, ?, ?, ?, ?, ?, 0, ?, NOW(), NOW())
      `,
      values: [
        tenantId, 
        patientId, 
        doctorId, 
        dependentId ?? null, 
        `${params.date} 00:00:00`, 
        params.token || 1,
        params.name
      ],
      description: "create_appointment"
    });
    return res.rows[0]?.insertId;
  }
}
