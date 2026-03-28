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
  summary: z.string().default("No summary"),
  operation: z.enum(["list", "aggregate", "latest", "lookup", "semantic_lookup", "summary"]).default("list"),
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
      "unknown"
    ])
  ).default("unknown"),
  patientName: z.string().nullable().optional(),
  doctorName: z.string().nullable().optional(),
  condition: z.string().nullable().optional(),
  metric: z.enum(["none", "revenue", "appointment_count", "doctor_with_most_appointments"]).default("none"),
  timeRange: z.object({
    preset: z.enum(["today", "yesterday", "this_week", "this_month", "all_time", "latest", "custom"]).default("all_time"),
    start: z.string().nullable().optional(),
    end: z.string().nullable().optional()
  }).default({ preset: "all_time" }),
  limit: z.number().int().min(1).max(100).default(5),
  needsSql: z.boolean().default(true),
  needsVector: z.boolean().default(false),
  sort: z.enum(["latest", "oldest", "highest", "lowest"]).default("latest"),
  confidence: z.number().min(0).max(1).default(1)
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
