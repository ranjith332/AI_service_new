import type { QueryIntent } from "./query-schemas.ts";

export interface BookingSession {
  tenantId: string;
  patientId?: number;
  dependentId?: number;
  name?: string;
  doctorName?: string;
  session?: "morning" | "afternoon" | "night";
  token?: number;
  appointmentDate?: string;
  stage: "IDENTITY" | "DEPENDENT_CHECK" | "SLOT_FILLING" | "FINISHED";
  updatedAt: number;
}

export class SessionService {
  private sessions = new Map<string, BookingSession>();
  private readonly ttlMs = 10 * 60 * 1000; // 10 minutes

  getSession(tenantId: string, sessionId: string): BookingSession | undefined {
    const key = `${tenantId}:${sessionId}`;
    const session = this.sessions.get(key);
    if (session && Date.now() - session.updatedAt > this.ttlMs) {
      this.sessions.delete(key);
      return undefined;
    }
    return session;
  }

  setSession(tenantId: string, sessionId: string, session: BookingSession): void {
    const key = `${tenantId}:${sessionId}`;
    this.sessions.set(key, { ...session, updatedAt: Date.now() });
  }

  clearSession(tenantId: string, sessionId: string): void {
    const key = `${tenantId}:${sessionId}`;
    this.sessions.delete(key);
  }
}
