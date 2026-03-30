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
  ) { }

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

    // 4. Check Schedule, Capacity & Live Status
    const capacity = await this.checkCapacity(params.tenantId, doctor.id, params.date, params.session);
    if (!capacity.available) {
      return { success: false, message: capacity.message || `No slots available for ${params.session} session on ${params.date}.` };
    }

    // 5. Check Token if provided (HMS Logic: check if blocked or already booked)
    if (params.token) {
      const detailedAvailability = await this.getAvailableTokensDetailed(params.tenantId, params.doctorName, params.date, params.session);
      const targetToken = detailedAvailability.find(t => t.token === params.token);
      
      if (!targetToken) {
        return { success: false, message: `Token ${params.token} is outside the valid range for the ${params.session} session.` };
      }
      if (targetToken.status === 'booked') {
        return { success: false, message: `Token ${params.token} is already booked by another patient.` };
      }
      if (targetToken.status === 'blocked') {
        return { success: false, message: `Token ${params.token} is reserved and cannot be booked via AI at this time.` };
      }
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

  public async findPatient(tenantId: string, name: string) {
    const p = this.schema.patients;
    const u = this.schema.users;
    // Join with users table as names are often stored there
    const res = await this.db.query<{ id: number }>({
      text: `
        SELECT p.${p.id} AS id 
        FROM ${p.table} p
        INNER JOIN ${u.table} u ON u.${u.id} = p.${p.user}
        WHERE p.${p.tenant} = ? 
          AND (
            LOWER(TRIM(u.${u.firstName})) LIKE ? OR 
            LOWER(TRIM(u.${u.lastName})) LIKE ? OR 
            LOWER(CONCAT(TRIM(u.${u.firstName}), ' ', TRIM(u.${u.lastName}))) LIKE ? OR
            LOWER(TRIM(p.${p.firstName})) LIKE ? OR 
            LOWER(TRIM(p.${p.lastName})) LIKE ? OR
            LOWER(CONCAT(TRIM(p.${p.firstName}), ' ', TRIM(p.${p.lastName}))) LIKE ?
          )
        LIMIT 1
      `,
      values: [
        tenantId,
        `%${name.toLowerCase()}%`,
        `%${name.toLowerCase()}%`,
        `%${name.toLowerCase()}%`,
        `%${name.toLowerCase()}%`,
        `%${name.toLowerCase()}%`,
        `%${name.toLowerCase()}%`
      ],
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

  public async findDoctor(tenantId: string, name: string) {
    const s = this.schema.doctors;
    const u = this.schema.users;
    const parts = name.trim().split(/\s+/);
    const firstName = parts[0] || "";
    const lastName = parts.length > 1 ? parts.slice(1).join(" ") : firstName;

    const res = await this.db.query<{ id: number }>({
      text: `
        SELECT d.${s.id} AS id 
        FROM ${s.table} d
        LEFT JOIN ${u.table} u ON u.${u.id} = d.${s.user}
        WHERE d.${s.tenant} = ? 
          AND (
            LOWER(TRIM(u.${u.firstName})) LIKE ? OR 
            LOWER(TRIM(u.${u.lastName})) LIKE ? OR 
            LOWER(CONCAT(TRIM(u.${u.firstName}), ' ', TRIM(u.${u.lastName}))) LIKE ? OR
            (LOWER(TRIM(u.${u.firstName})) LIKE ? AND LOWER(TRIM(u.${u.lastName})) LIKE ?) OR
            LOWER(TRIM(d.${s.firstName})) LIKE ? OR 
            LOWER(TRIM(d.${s.lastName})) LIKE ? OR
            LOWER(CONCAT(TRIM(d.${s.firstName}), ' ', TRIM(d.${s.lastName}))) LIKE ? OR
            (LOWER(TRIM(d.${s.firstName})) LIKE ? AND LOWER(TRIM(d.${s.lastName})) LIKE ?)
          )
        LIMIT 1
      `,
      values: [
        tenantId,
        `%${name.toLowerCase()}%`, `%${name.toLowerCase()}%`, `%${name.toLowerCase()}%`,
        `%${firstName.toLowerCase()}%`, `%${lastName.toLowerCase()}%`,
        `%${name.toLowerCase()}%`, `%${name.toLowerCase()}%`, `%${name.toLowerCase()}%`,
        `%${firstName.toLowerCase()}%`, `%${lastName.toLowerCase()}%`
      ],
      description: "find_doctor_joined_robust"
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

  public async getAvailableSessions(tenantId: string, doctorName: string, date: string): Promise<string[]> {
    const doctor = await this.findDoctor(tenantId, doctorName);
    if (!doctor) return [];

    const s = this.schema.scheduleDays;
    const dayOfWeek = new Date(date).getDay();
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
      values: [tenantId, doctor.id, dayName],
      description: "get_available_sessions"
    });

    if (res.rows.length === 0) return [];

    const row = res.rows[0];
    const available: string[] = [];
    if (row[s.morningTokens] > 0) available.push("morning");
    if (row[s.afternoonTokens] > 0) available.push("afternoon");
    if (row[s.nightTokens] > 0) available.push("night");

    return available;
  }

  public async checkCapacity(tenantId: string, doctorId: number, date: string, session: string): Promise<{ available: boolean; maxTokens: number; message?: string }> {
    const s = this.schema.scheduleDays;
    const sch = this.schema.schedules;
    const ds = this.schema.doctorSessions;
    
    // 1. Check Live Session Status (HMS Logic)
    const sessionStatus = await this.db.query<any>({
      text: `SELECT ${ds.sessionStatus} AS status FROM ${ds.table} WHERE ${ds.tenant} = ? AND ${ds.doctor} = ? AND ${ds.date} = ? ORDER BY id DESC LIMIT 1`,
      values: [tenantId, doctorId, date],
      description: "check_live_session_status"
    });

    if (sessionStatus.rows[0]?.status === 'stopped') {
      return { available: false, maxTokens: 0, message: "Doctor's session is currently stopped for today." };
    }

    // 2. Check Session Protection (Time Based - HMS Logic)
    const isToday = new Date(date).toDateString() === new Date().toDateString();
    if (isToday) {
      const currentHour = new Date().getHours();
      if (session === "morning" && currentHour >= 12) {
        return { available: false, maxTokens: 0, message: "Morning session booking is closed as it is past 12:00 PM." };
      }
      if (session === "afternoon" && currentHour >= 18) {
        return { available: false, maxTokens: 0, message: "Afternoon session booking is closed as it is past 6:00 PM." };
      }
    }

    const dayOfWeek = new Date(date).getDay();
    const dayName = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][dayOfWeek];

    const res = await this.db.query<any>({
      text: `
        SELECT sd.*, s.${sch.tokenBlockOption} as token_block_option
        FROM ${s.table} sd
        INNER JOIN ${sch.table} s ON s.id = sd.${s.schedule}
        WHERE s.${sch.tenant} = ? 
          AND s.${sch.doctor} = ? 
          AND sd.${s.availableOn} = ?
        LIMIT 1
      `,
      values: [tenantId, doctorId, dayName],
      description: "check_capacity_with_hms_logic"
    });

    if (res.rows.length === 0) return { available: false, maxTokens: 0 };

    const row = res.rows[0];
    let maxTokens = 0;
    if (session === "morning") maxTokens = row[s.morningTokens] || 0;
    else if (session === "afternoon") maxTokens = row[s.afternoonTokens] || 0;
    else if (session === "night") maxTokens = row[s.nightTokens] || 0;

    return { available: maxTokens > 0, maxTokens };
  }

  public async getAvailableTokensDetailed(tenantId: string, doctorName: string, date: string, session: string): Promise<any[]> {
    const doctor = await this.findDoctor(tenantId, doctorName);
    if (!doctor) return [];

    const s = this.schema.scheduleDays;
    const sch = this.schema.schedules;
    const dayOfWeek = new Date(date).getDay();
    const dayName = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][dayOfWeek];

    const res = await this.db.query<any>({
      text: `
        SELECT sd.*, s.${sch.tokenBlockOption} as token_block_option
        FROM ${s.table} sd
        INNER JOIN ${sch.table} s ON s.id = sd.${s.schedule}
        WHERE s.${sch.tenant} = ? 
          AND s.${sch.doctor} = ? 
          AND sd.${s.availableOn} = ?
        LIMIT 1
      `,
      values: [tenantId, doctor.id, dayName],
      description: "get_tokens_detailed"
    });

    if (res.rows.length === 0) return [];

    const row = res.rows[0];
    const blockOption = parseInt(row.token_block_option || "0");
    const ratioMap: Record<number, number> = { 1: 2, 2: 3, 3: 5, 4: 7 };
    const ratio = ratioMap[blockOption] || 0;

    let startToken = 1;
    let endToken = 0;

    if (session === "morning") {
      endToken = row[s.morningTokens] || 0;
    } else if (session === "afternoon") {
      startToken = (row[s.morningTokens] || 0) + 1;
      endToken = startToken + (row[s.afternoonTokens] || 0) - 1;
    } else if (session === "night") {
      startToken = (row[s.morningTokens] || 0) + (row[s.afternoonTokens] || 0) + 1;
      endToken = startToken + (row[s.nightTokens] || 0) - 1;
    }

    if (endToken < startToken) return [];

    // Get booked tokens
    const bookedRes = await this.db.query<any>({
      text: `SELECT ${this.schema.appointments.tokenNumber} as token FROM ${this.schema.appointments.table} WHERE ${this.schema.appointments.doctor} = ? AND DATE(${this.schema.appointments.scheduledAt}) = ? AND ${this.schema.appointments.isCompleted} != 4`,
      values: [doctor.id, date],
      description: "get_booked_tokens"
    });
    const bookedTokens = new Set(bookedRes.rows.map(r => r.token));

    const tokens = [];
    for (let i = startToken; i <= endToken; i++) {
      let status = "available";
      if (bookedTokens.has(i)) {
        status = "booked";
      } else if (ratio > 0 && i % ratio === 0) {
        status = "blocked";
      }
      tokens.push({ token: i, status });
    }

    return tokens;
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
