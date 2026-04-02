import { z } from "zod";

export const QueryOperationSchema = z.enum([
  "aggregate",
  "list",
  "lookup",
  "semantic_lookup",
  "general_knowledge",
  "book",
  "export_pdf",
]);

export const QueryFiltersSchema = z.object({
  doctorName: z.string().optional(),
  patientName: z.string().optional(),
  department: z.string().optional(),
  status: z.string().optional(),
  date: z.string().optional(),
  minExperience: z.number().optional(),
  limit: z.number().optional().default(5),
});

export const QueryIntentSchema = z.object({
  operation: QueryOperationSchema,
  targets: z.array(z.string()).describe("List of entities like patients, doctors, appointments, prescriptions"),
  filters: QueryFiltersSchema,
  justification: z.string().describe("A short explanation of why this intent was chosen"),
});

export type QueryIntent = z.infer<typeof QueryIntentSchema>;

export interface QueryPlan {
  intent: QueryIntent;
  actions: {
    type: "sql" | "vector" | "pdf";
    priority: number;
    description: string;
  }[];
  runVector: boolean;
}
