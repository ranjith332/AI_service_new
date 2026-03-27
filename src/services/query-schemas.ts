import { z } from "zod";

export const queryBodySchema = z.object({
  tenant_id: z
    .string()
    .trim()
    .min(1)
    .max(128)
    .regex(/^[A-Za-z0-9_-]+$/, "tenant_id may only contain letters, numbers, underscores, and hyphens"),
  user_query: z.string().trim().min(3).max(1000)
});

export const intentSchema = z.object({
  summary: z.string().min(1),
  operation: z.enum(["list", "aggregate", "latest", "lookup", "semantic_lookup", "summary"]),
  target: z.enum([
    "appointments",
    "patients",
    "lab_reports",
    "pathology_reports",
    "prescriptions",
    "billing",
    "medical_records",
    "doctors",
    "unknown"
  ]),
  patientName: z.string().nullable(),
  doctorName: z.string().nullable(),
  condition: z.string().nullable(),
  metric: z.enum(["none", "revenue", "appointment_count", "doctor_with_most_appointments"]),
  timeRange: z.object({
    preset: z.enum(["today", "yesterday", "this_week", "this_month", "all_time", "latest", "custom"]),
    start: z.string().nullable(),
    end: z.string().nullable()
  }),
  limit: z.number().int().min(1).max(100),
  needsSql: z.boolean(),
  needsVector: z.boolean(),
  sort: z.enum(["latest", "oldest", "highest", "lowest"]),
  confidence: z.number().min(0).max(1)
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
