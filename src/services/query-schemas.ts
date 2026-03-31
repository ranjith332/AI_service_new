import { z } from "zod";

export const queryBodySchema = z.object({
  tenant_id: z
    .string()
    .trim()
    .min(1)
    .max(128)
    .regex(/^[A-Za-z0-9_-]+$/, "tenant_id may only contain letters, numbers, underscores, and hyphens"),
  user_query: z.string().trim().min(3).max(1000),
  session_id: z.string().optional()
});

export const intentSchema = z.object({
  summary: z.string().default("No summary"),
  operation: z.preprocess(
    (val) => (typeof val === "string" ? val.toLowerCase() : val),
    z.enum(["list", "aggregate", "latest", "lookup", "semantic_lookup", "summary", "book", "export_pdf","count", "general_knowledge"]).catch("list")
  ).default("list"),
  target: z.preprocess(
    (val) => (typeof val === "string" ? val.toLowerCase() : val),
    z.enum([
      "appointments",
      "appointment",
      "patients",
      "patient",
      "prescriptions",
      "prescription",
      "doctors",
      "doctor",
      "medicines",
      "medicine",
      "users",
      "user",
      "dependents",
      "dependent",
      "schedules",
      "schedule",
      "scheduledays",
      "scheduleday",
      "doctorholidays",
      "doctorholiday",
      "doctorsessions",
      "doctorsession",
      "unknown"
    ]).catch("unknown")
  ).default("unknown"),
  targets: z.array(z.string()).default([]),
  filters: z.object({
    date: z.string().nullable().optional(),
    status: z.string().nullable().optional(),
    department: z.string().nullable().optional(),
    minExperience: z.number().nullable().optional()
  }).default({}),
  patientName: z.string().nullable().optional(),
  patientId: z.number().nullable().optional(),
  doctorName: z.string().nullable().optional(),
  condition: z.string().nullable().optional(),
  metric: z.preprocess(
    (val) => (typeof val === "string" ? val.toLowerCase() : val),
    z.enum(["none", "revenue", "appointment_count", "doctor_with_most_appointments", "count", "sum", "avg"]).catch("none")
  ).default("none"),
  timeRange: z.object({
    preset: z.enum(["today", "yesterday", "this_week", "this_month", "all_time", "latest", "custom"]).default("all_time"),
    start: z.string().nullable().optional(),
    end: z.string().nullable().optional()
  }).default({ preset: "all_time" }),
  limit: z.preprocess((val) => (val === null ? undefined : val), z.number().int().min(1).max(100).default(20)),
  needsSql: z.boolean().default(true),
  needsVector: z.boolean().default(false),
  sort: z.preprocess(
    (val) => (typeof val === "string" ? val.toLowerCase() : val),
    z.enum(["latest", "oldest", "highest", "lowest"]).catch("latest")
  ).default("latest"),
  needsClarification: z.boolean().default(false),
  clarificationMessage: z.string().nullable().optional(),
  bookingDetails: z.preprocess(
    (val) => (val === null ? undefined : val),
    z.object({
      name: z.string().nullable().optional(),
      doctor: z.string().nullable().optional(),
      session: z.enum(["morning", "afternoon", "night", "none"]).default("none"),
      token: z.number().nullable().optional(),
      appointmentDate: z.string().nullable().optional()
    }).default({ session: "none" })
  ).default({ session: "none" }),
  confidence: z.preprocess((val) => (val === null ? undefined : val), z.number().min(0).max(1).default(1))
});

// RAW SCHEMA: Very permissive. Used ONLY for LLM structured output.
// We make almost everything optional so the AI doesn't fail validation if it misses a field.
// The RICH schema (intentSchema) will handle defaults and cleanup.
export const intentSchemaRaw = z.object({
  summary: z.string().optional().nullable(),
  operation: z.string().optional().nullable(),
  target: z.string().optional().nullable(),
  targets: z.array(z.string()).optional().nullable(),
  filters: z.object({
    date: z.string().nullable().optional(),
    status: z.string().nullable().optional(),
    department: z.string().nullable().optional(),
    minExperience: z.number().nullable().optional()
  }).optional().nullable(),
  patientName: z.string().nullable().optional(),
  patientId: z.number().nullable().optional(),
  doctorName: z.string().nullable().optional(),
  condition: z.string().nullable().optional(),
  metric: z.string().optional().nullable(),
  timeRange: z.object({
    preset: z.string().optional().nullable(),
    start: z.string().nullable().optional(),
    end: z.string().nullable().optional()
  }).optional().nullable(),
  limit: z.number().int().optional().nullable(),
  needsSql: z.boolean().optional().nullable(),
  needsVector: z.boolean().optional().nullable(),
  sort: z.string().optional().nullable(),
  needsClarification: z.boolean().optional().nullable(),
  clarificationMessage: z.string().nullable().optional(),
  bookingDetails: z.object({
    name: z.string().nullable().optional(),
    doctor: z.string().nullable().optional(),
    session: z.string().optional().nullable(),
    token: z.number().nullable().optional(),
    appointmentDate: z.string().nullable().optional()
  }).optional().nullable(),
  confidence: z.number().optional().nullable()
});

export const strategySchema = z.enum(["sql", "vector", "hybrid"]);

export const dynamicFilterValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const dynamicSqlPlanSchema = z.object({
  baseTable: z.string().min(1),
  distinct: z.boolean().default(false),
  select: z
    .array(
      z.object({
        table: z.string().min(1),
        column: z.string().min(1),
        alias: z.string().nullable(),
        aggregate: z.enum(["none", "count", "sum", "avg", "min", "max"])
      })
    )
    .min(1)
    .max(20),
  joins: z
    .array(
      z.object({
        table: z.string().min(1),
        joinType: z.enum(["inner", "left"]),
        on: z
          .array(
            z.object({
              leftTable: z.string().min(1),
              leftColumn: z.string().min(1),
              rightTable: z.string().min(1),
              rightColumn: z.string().min(1)
            })
          )
          .min(1)
          .max(5)
      })
    )
    .max(6),
  filters: z
    .array(
      z.object({
        table: z.string().min(1),
        column: z.string().min(1),
        operator: z.enum(["eq", "neq", "like", "gte", "lte", "gt", "lt", "between", "in", "is_null", "is_not_null"]),
        value: dynamicFilterValueSchema.optional(),
        values: z.array(dynamicFilterValueSchema).max(20).optional()
      })
    )
    .max(20),
  groupBy: z.array(z.object({ table: z.string().min(1), column: z.string().min(1) })).max(10),
  orderBy: z
    .array(
      z.object({
        table: z.string().min(1),
        column: z.string().min(1),
        direction: z.enum(["asc", "desc"])
      })
    )
    .max(10),
  limit: z.number().int().min(1).max(100),
  notes: z.string().min(1)
});

export type QueryBody = z.infer<typeof queryBodySchema>;
export type QueryIntent = z.infer<typeof intentSchema>;
export type ExecutionStrategy = z.infer<typeof strategySchema>;
export type DynamicSqlPlan = z.infer<typeof dynamicSqlPlanSchema>;
