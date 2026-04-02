import {
  mysqlTable,
  serial,
  varchar,
  text,
  timestamp,
  int,
  boolean,
  decimal,
  json,
} from "drizzle-orm/mysql-core";

export const tenants = mysqlTable("tenants", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).unique().notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const users = mysqlTable("users", {
  id: serial("id").primaryKey(),
  tenantId: int("tenant_id").notNull(),
  firstName: varchar("first_name", { length: 255 }),
  lastName: varchar("last_name", { length: 255 }),
  email: varchar("email", { length: 255 }).notNull(),
  password: varchar("password", { length: 255 }),
  role: varchar("role", { length: 50 }).default("user"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const patients = mysqlTable("patients", {
  id: serial("id").primaryKey(),
  userId: int("user_id").references(() => users.id),
  tenantId: int("tenant_id").notNull(),
  patientUniqueId: varchar("patient_unique_id", { length: 50 }).unique(),
  firstName: varchar("first_name", { length: 255 }),
  lastName: varchar("last_name", { length: 255 }),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 20 }),
  gender: varchar("gender", { length: 20 }),
  dob: varchar("dob", { length: 20 }),
  bloodGroup: varchar("blood_group", { length: 10 }),
  address: text("address"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const doctors = mysqlTable("doctors", {
  id: serial("id").primaryKey(),
  userId: int("user_id").references(() => users.id),
  tenantId: int("tenant_id").notNull(),
  firstName: varchar("first_name", { length: 255 }),
  lastName: varchar("last_name", { length: 255 }),
  speciality: varchar("speciality", { length: 255 }),
  experience: int("experience"),
  bio: text("bio"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const appointments = mysqlTable("appointments", {
  id: serial("id").primaryKey(),
  tenantId: int("tenant_id").notNull(),
  patientId: int("patient_id").references(() => patients.id),
  doctorId: int("doctor_id").references(() => doctors.id),
  dependentId: int("dependent_id"),
  scheduledAt: timestamp("scheduled_at").notNull(),
  tokenNumber: int("token_number"),
  status: int("status").default(0), // 0: Pending, 1: Completed, 4: Cancelled
  isCompleted: int("is_completed").default(0),
  patientName: varchar("patient_name", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const prescriptions = mysqlTable("prescriptions", {
  id: serial("id").primaryKey(),
  tenantId: int("tenant_id").notNull(),
  appointmentId: int("appointment_id").references(() => appointments.id),
  patientId: int("patient_id").references(() => patients.id),
  doctorId: int("doctor_id").references(() => doctors.id),
  problem: text("problem"),
  test: text("test"),
  advice: text("advice"),
  nextVisitAt: timestamp("next_visit_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const prescriptionMedicines = mysqlTable("prescription_medicines", {
  id: serial("id").primaryKey(),
  prescriptionId: int("prescription_id").references(() => prescriptions.id),
  medicineName: varchar("medicine_name", { length: 255 }),
  dosage: varchar("dosage", { length: 255 }),
  duration: varchar("duration", { length: 255 }),
  time: varchar("time", { length: 255 }),
  comment: text("comment"),
});
