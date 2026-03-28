import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

import { env } from "../config/env.ts";

export interface UserTableMapping {
  table: string;
  id: string;
  department: string;
  firstName: string;
  lastName: string;
  email: string;
  city: string;
  password: string;
  providerName: string;
  providerId: string;
  designation: string;
  phone: string;
  regionCode: string;
  superAdminDefault: string;
  gender: string;
  adminDefault: string;
  qualification: string;
  bloodGroup: string;
  dob: string;
  emailVerifiedAt: string;
  owner: string;
  ownerType: string;
  status: string;
  language: string;
  username: string;
  hospitalName: string;
  tenant: string;
  rememberToken: string;
  facebookUrl: string;
  twitterUrl: string;
  instagramUrl: string;
  linkedinUrl: string;
  createdAt: string;
  updatedAt: string;
  themeMode: string;
  hospitalType: string;
  deletedAt: string;
}

export interface PatientTableMapping {
  table: string;
  id: string;
  user: string;
  tenant: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  gender: string;
  dob: string;
  bloodGroup: string;
  status: string;
  language: string;
  customField: string;
  template: string;
  patientUniqueId: string;
  address: string;
  city: string;
  pincode: string;
  createdAt: string;
  updatedAt: string;
}

export interface DoctorTableMapping {
  table: string;
  id: string;
  user: string;
  tenant: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  gender: string;
  dob: string;
  bloodGroup: string;
  status: string;
  language: string;
  designation: string;
  qualification: string;
  regionCode: string;
  department: string;
  specialty: string;
  description: string;
  appointmentCharge: string;
  googleDrivePath: string;
  fcmToken: string;
  opTime: string;
  notificationStatus: string;
  lastNotificationSentAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppointmentTableMapping {
  table: string;
  id: string;
  tenant: string;
  patient: string;
  doctor: string;
  dependent: string;
  patientName: string;
  relation: string;
  bookedBy: string;
  department: string;
  appointmentType: string;
  scheduledAt: string;
  problem: string;
  isCompleted: string;
  tokenNumber: string;
  tokenLabel: string;
  paymentStatus: string;
  paymentType: string;
  customField: string;
  createdAt: string;
  updatedAt: string;
}

export interface PrescriptionTableMapping {
  table: string;
  id: string;
  tenant: string;
  patient: string;
  doctor: string;
  status: string;
  updatedAt: string;
  createdAt: string;
  foodAllergies: string;
  bleedingTendency: string;
  heartDisease: string;
  highBloodPressure: string;
  diabetic: string;
  surgery: string;
  accident: string;
  otherConditions: string;
  medicalHistory: string;
  currentMedication: string;
  pregnancy: string;
  breastFeeding: string;
  healthInsurance: string;
  lowIncome: string;
  reference: string;
  pulseRate: string;
  temperature: string;
  problemDescription: string;
  test: string;
  advice: string;
  nextVisitQuantity: string;
  nextVisitTime: string;
}

export interface MedicineTableMapping {
  table: string;
  id: string;
  category: string;
  brand: string;
  name: string;
  sellingPrice: string;
  buyingPrice: string;
  quantity: string;
  availableQuantity: string;
  saltComposition: string;
  description: string;
  sideEffects: string;
  image: string;
  tenant: string;
  createdAt: string;
  updatedAt: string;
}

export interface SchemaMapping {
  users: UserTableMapping;
  patients: PatientTableMapping;
  doctors: DoctorTableMapping;
  appointments: AppointmentTableMapping;
  prescriptions: PrescriptionTableMapping;
  prescription: PrescriptionTableMapping;
  medicines: MedicineTableMapping;
}

const defaultMapping: SchemaMapping = {
  users: {
    table: "users",
    id: "id",
    department: "department_id",
    firstName: "first_name",
    lastName: "last_name",
    email: "email",
    city: "city",
    password: "password",
    providerName: "provider_name",
    providerId: "provider_id",
    designation: "designation",
    phone: "phone",
    regionCode: "region_code",
    superAdminDefault: "is_super_admin_default",
    gender: "gender",
    adminDefault: "is_admin_default",
    qualification: "qualification",
    bloodGroup: "blood_group",
    dob: "dob",
    emailVerifiedAt: "email_verified_at",
    owner: "owner_id",
    ownerType: "owner_type",
    status: "status",
    language: "language",
    username: "username",
    hospitalName: "hospital_name",
    tenant: "tenant_id",
    rememberToken: "remember_token",
    facebookUrl: "facebook_url",
    twitterUrl: "twitter_url",
    instagramUrl: "instagram_url",
    linkedinUrl: "linkedin_url",
    createdAt: "created_at",
    updatedAt: "updated_at",
    themeMode: "theme_mode",
    hospitalType: "hospital_type_id",
    deletedAt: "deleted_at"
  },
  patients: {
    table: "patients",
    id: "id",
    user: "user_id",
    tenant: "tenant_id",
    email: "email",
    firstName: "first_name",
    lastName: "last_name",
    phone: "phone",
    gender: "gender",
    dob: "dob",
    bloodGroup: "blood_group",
    status: "status",
    language: "language",
    customField: "custom_field",
    template: "template_id",
    patientUniqueId: "patient_unique_id",
    address: "address",
    city: "city",
    pincode: "pincode",
    createdAt: "created_at",
    updatedAt: "updated_at"
  },
  doctors: {
    table: "doctors",
    id: "id",
    user: "user_id",
    tenant: "tenant_id",
    email: "email",
    firstName: "first_name",
    lastName: "last_name",
    phone: "phone",
    gender: "gender",
    dob: "dob",
    bloodGroup: "blood_group",
    status: "status",
    language: "language",
    designation: "designation",
    qualification: "qualification",
    regionCode: "region_code",
    department: "doctor_department_id",
    specialty: "specialist",
    description: "description",
    appointmentCharge: "appointment_charge",
    googleDrivePath: "google_json_file_path",
    fcmToken: "fcm_token",
    opTime: "op_time",
    notificationStatus: "op_notification_status",
    lastNotificationSentAt: "op_last_notification_sent_at",
    createdAt: "created_at",
    updatedAt: "updated_at"
  },
  appointments: {
    table: "appointments",
    id: "id",
    tenant: "tenant_id",
    patient: "patient_id",
    doctor: "doctor_id",
    dependent: "dependent_id",
    patientName: "patient_name",
    relation: "relation",
    bookedBy: "booked_by",
    department: "department_id",
    appointmentType: "appointment_type",
    scheduledAt: "opd_date",
    problem: "problem",
    isCompleted: "is_completed",
    tokenNumber: "token_number",
    tokenLabel: "token_label",
    paymentStatus: "payment_status",
    paymentType: "payment_type",
    customField: "custom_field",
    createdAt: "created_at",
    updatedAt: "updated_at"
  },
  prescriptions: {
    table: "prescriptions",
    id: "id",
    tenant: "tenant_id",
    patient: "patient_id",
    doctor: "doctor_id",
    status: "status",
    updatedAt: "updated_at",
    createdAt: "created_at",
    foodAllergies: "food_allergies",
    bleedingTendency: "tendency_bleed",
    heartDisease: "heart_disease",
    highBloodPressure: "high_blood_pressure",
    diabetic: "diabetic",
    surgery: "surgery",
    accident: "accident",
    otherConditions: "others",
    medicalHistory: "medical_history",
    currentMedication: "current_medication",
    pregnancy: "female_pregnancy",
    breastFeeding: "breast_feeding",
    healthInsurance: "health_insurance",
    lowIncome: "low_income",
    reference: "reference",
    pulseRate: "plus_rate",
    temperature: "temperature",
    problemDescription: "problem_description",
    test: "test",
    advice: "advice",
    nextVisitQuantity: "next_visit_qty",
    nextVisitTime: "next_visit_time"
  },
  prescription: {
    table: "prescriptions",
    id: "id",
    tenant: "tenant_id",
    patient: "patient_id",
    doctor: "doctor_id",
    status: "status",
    updatedAt: "updated_at",
    createdAt: "created_at",
    foodAllergies: "food_allergies",
    bleedingTendency: "tendency_bleed",
    heartDisease: "heart_disease",
    highBloodPressure: "high_blood_pressure",
    diabetic: "diabetic",
    surgery: "surgery",
    accident: "accident",
    otherConditions: "others",
    medicalHistory: "medical_history",
    currentMedication: "current_medication",
    pregnancy: "female_pregnancy",
    breastFeeding: "breast_feeding",
    healthInsurance: "health_insurance",
    lowIncome: "low_income",
    reference: "reference",
    pulseRate: "plus_rate",
    temperature: "temperature",
    problemDescription: "problem_description",
    test: "test",
    advice: "advice",
    nextVisitQuantity: "next_visit_qty",
    nextVisitTime: "next_visit_time"
  },
  medicines: {
    table: "medicines",
    id: "id",
    category: "category_id",
    brand: "brand_id",
    name: "name",
    sellingPrice: "selling_price",
    buyingPrice: "buying_price",
    quantity: "quantity",
    availableQuantity: "available_quantity",
    saltComposition: "salt_composition",
    description: "description",
    sideEffects: "side_effects",
    image: "image",
    tenant: "tenant_id",
    createdAt: "created_at",
    updatedAt: "updated_at"
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
