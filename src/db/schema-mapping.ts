import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

import { env } from "../config/env.ts";

export interface PatientTableMapping {
  table: string;
  idColumn: string;
  tenantColumn: string;
  nameColumn: string;
  updatedAtColumn: string;
  conditionColumn: string;
  genderColumn: string;
  dobColumn: string;
}

export interface DoctorTableMapping {
  table: string;
  idColumn: string;
  tenantColumn: string;
  nameColumn: string;
  specialtyColumn: string;
  updatedAtColumn: string;
}

export interface AppointmentTableMapping {
  table: string;
  idColumn: string;
  tenantColumn: string;
  patientIdColumn: string;
  doctorIdColumn: string;
  scheduledAtColumn: string;
  statusColumn: string;
  updatedAtColumn: string;
}

export interface ReportTableMapping {
  table: string;
  idColumn: string;
  tenantColumn: string;
  patientIdColumn: string;
  nameColumn: string;
  summaryColumn: string;
  textColumn: string;
  reportedAtColumn: string;
  updatedAtColumn: string;
}

export interface PrescriptionTableMapping {
  table: string;
  idColumn: string;
  tenantColumn: string;
  patientIdColumn: string;
  doctorIdColumn: string;
  medicationColumn: string;
  dosageColumn: string;
  instructionsColumn: string;
  prescribedAtColumn: string;
  updatedAtColumn: string;
}

export interface BillingTableMapping {
  table: string;
  idColumn: string;
  tenantColumn: string;
  patientIdColumn: string;
  doctorIdColumn: string;
  amountColumn: string;
  statusColumn: string;
  billedAtColumn: string;
  updatedAtColumn: string;
}

export interface MedicalRecordTableMapping {
  table: string;
  idColumn: string;
  tenantColumn: string;
  patientIdColumn: string;
  diagnosisColumn: string;
  conditionsColumn: string;
  allergiesColumn: string;
  updatedAtColumn: string;
}

export interface SchemaMapping {
  patients: PatientTableMapping;
  doctors: DoctorTableMapping;
  appointments: AppointmentTableMapping;
  lab_reports: ReportTableMapping;
  pathology_reports: ReportTableMapping;
  prescriptions: PrescriptionTableMapping;
  billing: BillingTableMapping;
  medical_records: MedicalRecordTableMapping;
}

const defaultMapping: SchemaMapping = {
  patients: {
    table: "patients",
    idColumn: "id",
    tenantColumn: "tenant_id",
    nameColumn: "full_name",
    updatedAtColumn: "updated_at",
    conditionColumn: "chronic_conditions",
    genderColumn: "gender",
    dobColumn: "date_of_birth"
  },
  doctors: {
    table: "doctors",
    idColumn: "id",
    tenantColumn: "tenant_id",
    nameColumn: "full_name",
    specialtyColumn: "specialty",
    updatedAtColumn: "updated_at"
  },
  appointments: {
    table: "appointments",
    idColumn: "id",
    tenantColumn: "tenant_id",
    patientIdColumn: "patient_id",
    doctorIdColumn: "doctor_id",
    scheduledAtColumn: "scheduled_at",
    statusColumn: "status",
    updatedAtColumn: "updated_at"
  },
  lab_reports: {
    table: "lab_reports",
    idColumn: "id",
    tenantColumn: "tenant_id",
    patientIdColumn: "patient_id",
    nameColumn: "report_name",
    summaryColumn: "summary",
    textColumn: "result_text",
    reportedAtColumn: "reported_at",
    updatedAtColumn: "updated_at"
  },
  pathology_reports: {
    table: "pathology_reports",
    idColumn: "id",
    tenantColumn: "tenant_id",
    patientIdColumn: "patient_id",
    nameColumn: "report_name",
    summaryColumn: "summary",
    textColumn: "result_text",
    reportedAtColumn: "reported_at",
    updatedAtColumn: "updated_at"
  },
  prescriptions: {
    table: "prescriptions",
    idColumn: "id",
    tenantColumn: "tenant_id",
    patientIdColumn: "patient_id",
    doctorIdColumn: "doctor_id",
    medicationColumn: "medication_name",
    dosageColumn: "dosage",
    instructionsColumn: "instructions",
    prescribedAtColumn: "prescribed_at",
    updatedAtColumn: "updated_at"
  },
  billing: {
    table: "billing",
    idColumn: "id",
    tenantColumn: "tenant_id",
    patientIdColumn: "patient_id",
    doctorIdColumn: "doctor_id",
    amountColumn: "total_amount",
    statusColumn: "payment_status",
    billedAtColumn: "billed_at",
    updatedAtColumn: "updated_at"
  },
  medical_records: {
    table: "medical_records",
    idColumn: "id",
    tenantColumn: "tenant_id",
    patientIdColumn: "patient_id",
    diagnosisColumn: "diagnosis_summary",
    conditionsColumn: "conditions",
    allergiesColumn: "allergies",
    updatedAtColumn: "updated_at"
  }
};

function deepMerge<T extends object>(base: T, override: Partial<T>): T {
  const output = { ...base } as Record<string, unknown>;

  for (const [key, value] of Object.entries(override)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      output[key] = deepMerge((base as Record<string, unknown>)[key] as object, value as object);
      continue;
    }

    output[key] = value;
  }

  return output as T;
}

export async function loadSchemaMapping(): Promise<SchemaMapping> {
  if (!existsSync(env.SCHEMA_MAPPING_PATH)) {
    return defaultMapping;
  }

  const file = await readFile(env.SCHEMA_MAPPING_PATH, "utf-8");
  const parsed = JSON.parse(file) as Partial<SchemaMapping>;
  return deepMerge(defaultMapping, parsed);
}
