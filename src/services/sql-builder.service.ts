import type { SchemaMapping } from "../db/schema-mapping.ts";
import type { SqlQuery } from "../db/client.ts";
import type { DynamicSqlPlan, QueryIntent } from "./query-schemas.ts";
import type { DiscoveredSchema } from "./schema-discovery.service.ts";
import { UnsupportedQueryError } from "../utils/errors.ts";
import { resolveTimeRange } from "../utils/time.ts";
import { logger } from "../utils/logger.ts";

interface BuildParams {
  tenantId: string;
  intent: QueryIntent;
  schema: SchemaMapping;
  timeZone: string;
}

export class SqlBuilderService {
  constructor(private readonly mapping: SchemaMapping) {}

  build(params: BuildParams): SqlQuery {
    const { intent } = params;

    if (intent.target === "appointments") {
      return this.buildAppointmentsQuery(params);
    }

    if (intent.target === "patients") {
      return this.buildPatientsQuery(params);
    }

    if (intent.target === "doctors") {
       if (intent.operation === "list") {
          return this.buildDoctorsListQuery(params);
       }
       return this.buildDoctorRankingQuery(params);
    }

    if (intent.metric === "doctor_with_most_appointments") {
       return this.buildDoctorRankingQuery(params);
    }

    if (intent.target === "prescriptions" || intent.target === "prescription") {
      return this.buildPrescriptionLookupQuery(params);
    }

    if (intent.target === "medicines") {
      return this.buildMedicinesQuery(params);
    }

    if (intent.target === "dependents" || intent.target === "dependent") {
      return this.buildDependentsQuery(params);
    }

    if (intent.target === "schedules" || intent.target === "schedule" || intent.target === "scheduledays" || intent.target === "scheduleday") {
      return this.buildSchedulesQuery(params);
    }

    throw new UnsupportedQueryError();
  }

  private findTable(tableName: string, schema: DiscoveredSchema): string | undefined {
    if (schema[tableName]) return tableName;
    const plural = `${tableName}s`;
    if (schema[plural]) return plural;
    const singular = tableName.replace(/s$/, "");
    if (schema[singular]) return singular;
    const snake = tableName.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/^_/, "");
    if (schema[snake]) return snake;
    const snakePlural = `${snake}s`;
    if (schema[snakePlural]) return snakePlural;
    
    // Check all keys for a fuzzy match
    const lower = tableName.toLowerCase().replace(/s$/, "");
    for (const key of Object.keys(schema)) {
        if (key.toLowerCase().replace(/s$/, "") === lower) return key;
    }

    return undefined;
  }

  buildDynamic(params: {
    tenantId: string;
    plan: DynamicSqlPlan;
    discoveredSchema: DiscoveredSchema;
  }): SqlQuery {
    const schema = params.discoveredSchema;
    const baseTableName = this.findTable(params.plan.baseTable, schema);
    if (!baseTableName) {
      throw new UnsupportedQueryError(`Unknown base table ${params.plan.baseTable}.`);
    }
    const baseTable = schema[baseTableName]!;

    const aliasByTable = new Map<string, string>();
    const values: unknown[] = [];
    let aliasIndex = 0;

    const assignAlias = (tableName: string) => {
      const resolved = this.findTable(tableName, schema) || tableName;
      const existing = aliasByTable.get(resolved);
      if (existing) {
        return existing;
      }

      const alias = `t${aliasIndex}`;
      aliasIndex += 1;
      aliasByTable.set(resolved, alias);
      return alias;
    };

    const getColumn = (tableName: string, columnName: string) => {
      const resolved = this.findTable(tableName, schema);
      if (!resolved) {
        throw new UnsupportedQueryError(`Table ${tableName} is not allowed.`);
      }

      const table = schema[resolved]!;
      const column = table.columns.find((item) => item.name === columnName);
      if (!column) {
        throw new UnsupportedQueryError(`Column ${tableName}.${columnName} is not allowed.`);
      }

      return column;
    };

    const quote = (identifier: string) => {
      if (!/^[A-Za-z0-9_]+$/.test(identifier)) {
        throw new UnsupportedQueryError(`Invalid identifier ${identifier}.`);
      }

      return `\`${identifier}\``;
    };

    const baseAlias = assignAlias(baseTable.name);
    const allowedTableNames = new Set<string>([
        baseTable.name, 
        ...params.plan.joins.map((join) => this.findTable(join.table, schema) || join.table)
    ]);

    const assertAllowedTableReference = (tableName: string) => {
      const resolved = this.findTable(tableName, schema) || tableName;
      if (!allowedTableNames.has(resolved)) {
        throw new UnsupportedQueryError(`Table ${tableName} is referenced without being part of the query joins.`);
      }
    };

    const selectSql = params.plan.select
      .map((selection) => {
        assertAllowedTableReference(selection.table);
        getColumn(selection.table, selection.column);
        const alias = assignAlias(selection.table);
        const qualified = `${alias}.${quote(selection.column)}`;
        const expr =
          selection.aggregate === "none" ? qualified : `${selection.aggregate.toUpperCase()}(${selection.aggregate === "count" ? "*" : qualified})`;
        const label = selection.alias ? ` AS ${quote(selection.alias)}` : "";
        return `${expr}${label}`;
      })
      .join(", ");

    const joinSql = params.plan.joins
      .map((join) => {
        const resolved = this.findTable(join.table, schema);
        if (!resolved) {
          throw new UnsupportedQueryError(`Join table ${join.table} is not allowed.`);
        }
        const table = schema[resolved]!;

        const joinAlias = assignAlias(table.name);
        let predicates = join.on.map((condition) => {
          assertAllowedTableReference(condition.leftTable);
          assertAllowedTableReference(condition.rightTable);
          getColumn(condition.leftTable, condition.leftColumn);
          getColumn(condition.rightTable, condition.rightColumn);
          const leftAlias = assignAlias(condition.leftTable);
          const rightAlias = assignAlias(condition.rightTable);
          return `${leftAlias}.${quote(condition.leftColumn)} = ${rightAlias}.${quote(condition.rightColumn)}`;
        });

        // AUTO-JOIN FALLBACK: If planner didn't specify 'ON' conditions, infer from mapping
        if (predicates.length === 0) {
            const possibleOtherTables = [params.plan.baseTable, ...params.plan.joins.map(j => j.table)].filter(t => t !== table.name);
            let inferred = false;
            
            const toEntity = (tableName: string) => tableName.toLowerCase().replace(/s$/, "").replace(/_([a-z])/g, (_, g) => g.toUpperCase());

            for (const otherName of possibleOtherTables) {
                const otherAlias = assignAlias(otherName);
                const resolvedOther = this.findTable(otherName, schema);
                if (!resolvedOther) continue;
                const otherTableData = schema[resolvedOther]!;

                const otherEntity = toEntity(otherName);
                const joinEntity = toEntity(table.name);

                // 1. HARDCODED ENTITY ROADMAP (Absolute Stability)
                const RELATIONSHIP_MAP: Record<string, Record<string, string>> = {
                    appointments: { patients: 'patient_id', doctors: 'doctor_id' },
                    prescriptions: { patients: 'patient_id', doctors: 'doctor_id', users: 'patient_id' },
                    patient_dependents: { patients: 'patient_id' },
                    schedules: { doctors: 'doctor_id' },
                    schedule_days: { schedules: 'schedule_id' },
                    slots: { schedule_days: 'schedule_day_id' },
                    patients: { users: 'user_id' },
                    doctors: { users: 'user_id' }
                };

                const getRoadmapLink = (a: string, b: string) => (RELATIONSHIP_MAP[a]?.[b]);
                const roadmapFk = getRoadmapLink(joinEntity, otherEntity) || getRoadmapLink(table.name, otherName);
                
                if (roadmapFk && table.columns.some(c => c.name === roadmapFk)) {
                    predicates.push(`${joinAlias}.${quote(roadmapFk)} = ${otherAlias}.${quote('id')}`);
                    inferred = true; break;
                }
                const reverseRoadmapFk = getRoadmapLink(otherEntity, joinEntity) || getRoadmapLink(otherName, table.name);
                if (reverseRoadmapFk && otherTableData.columns.some(c => c.name === reverseRoadmapFk)) {
                    predicates.push(`${otherAlias}.${quote(reverseRoadmapFk)} = ${joinAlias}.${quote('id')}`);
                    inferred = true; break;
                }

                // 2. GREEDY COLUMN LINKER (Folproof Relationship Discovery)
                const joinFkName = `${otherEntity}_id`;
                if (table.columns.find(c => c.name === joinFkName)) {
                    predicates.push(`${joinAlias}.${quote(joinFkName)} = ${otherAlias}.${quote('id')}`);
                    inferred = true; break;
                }
                const otherFkName = `${joinEntity}_id`;
                if (otherTableData.columns.find(c => c.name === otherFkName)) {
                    predicates.push(`${otherAlias}.${quote(otherFkName)} = ${joinAlias}.${quote('id')}`);
                    inferred = true; break;
                }

                // 3. Bidirectional Mapping Lookup (Schema-Mapping.ts Backup)
                const joinTableMap: any = (this.mapping as any)[table.name] || (this.mapping as any)[this.findTable(table.name, schema) || ''];
                const otherTableMap: any = (this.mapping as any)[otherName] || (this.mapping as any)[this.findTable(otherName, schema) || ''];

                const matchesEntity = (mapKey: string, entity: string) => 
                    entity.toLowerCase() === mapKey.toLowerCase() || 
                    entity.toLowerCase().startsWith(mapKey.toLowerCase()) ||
                    mapKey.toLowerCase().startsWith(entity.toLowerCase());

                if (joinTableMap) {
                    for (const [mapKey, colName] of Object.entries(joinTableMap)) {
                        if (matchesEntity(mapKey, otherEntity) && typeof colName === "string") {
                             predicates.push(`${joinAlias}.${quote(colName)} = ${otherAlias}.${quote('id')}`);
                             inferred = true; break;
                        }
                    }
                }
                if (inferred) break;

                if (otherTableMap) {
                    for (const [mapKey, colName] of Object.entries(otherTableMap)) {
                        if (matchesEntity(mapKey, joinEntity) && typeof colName === "string") {
                             predicates.push(`${otherAlias}.${quote(colName)} = ${joinAlias}.${quote('id')}`);
                             inferred = true; break;
                        }
                    }
                }
                if (inferred) break;
            }

            if (!inferred) {
                logger.error({ joinTable: table.name, candidates: possibleOtherTables }, "SHIELD_OF_STABILITY: No relationship found. Aborting join to prevent Cartesian product.");
                throw new UnsupportedQueryError(`Could not safely link table '${table.name}' to the rest of the query. Please rephrase or use explicit filters.`);
            }
        }

        predicates.push(`${joinAlias}.${quote(table.tenant)} = ?`);
        values.push(params.tenantId);

        return `${join.joinType.toUpperCase()} JOIN ${quote(table.name)} ${joinAlias} ON ${predicates.join(" AND ")}`;
      })
      .join("\n");

    const whereParts: string[] = [];
    if (baseTable.tenant) {
      whereParts.push(`${baseAlias}.${quote(baseTable.tenant)} = ?`);
      values.push(params.tenantId);
    }

    for (const filter of params.plan.filters) {
      assertAllowedTableReference(filter.table);
      getColumn(filter.table, filter.column);
      const alias = assignAlias(filter.table);
      const columnSql = `${alias}.${quote(filter.column)}`;

      switch (filter.operator) {
        case "eq":
          whereParts.push(`${columnSql} = ?`);
          values.push(filter.value ?? null);
          break;
        case "neq":
          whereParts.push(`${columnSql} <> ?`);
          values.push(filter.value ?? null);
          break;
        case "like":
          whereParts.push(`LOWER(COALESCE(${columnSql}, '')) LIKE ?`);
          values.push(`%${String(filter.value ?? "").toLowerCase()}%`);
          break;
        case "gte":
          whereParts.push(`${columnSql} >= ?`);
          values.push(filter.value ?? null);
          break;
        case "lte":
          whereParts.push(`${columnSql} <= ?`);
          values.push(filter.value ?? null);
          break;
        case "gt":
          whereParts.push(`${columnSql} > ?`);
          values.push(filter.value ?? null);
          break;
        case "lt":
          whereParts.push(`${columnSql} < ?`);
          values.push(filter.value ?? null);
          break;
        case "between":
          if (!filter.values || filter.values.length < 2) {
            throw new UnsupportedQueryError("Between filters require two values.");
          }
          whereParts.push(`${columnSql} BETWEEN ? AND ?`);
          values.push(filter.values[0], filter.values[1]);
          break;
        case "in":
          if (!filter.values?.length) {
            throw new UnsupportedQueryError("IN filters require values.");
          }
          whereParts.push(`${columnSql} IN (${filter.values.map(() => "?").join(", ")})`);
          values.push(...filter.values);
          break;
        case "is_null":
          whereParts.push(`${columnSql} IS NULL`);
          break;
        case "is_not_null":
          whereParts.push(`${columnSql} IS NOT NULL`);
          break;
      }
    }

    const groupBySql = params.plan.groupBy.length
      ? `GROUP BY ${params.plan.groupBy
          .map((groupBy) => {
            assertAllowedTableReference(groupBy.table);
            getColumn(groupBy.table, groupBy.column);
            return `${assignAlias(groupBy.table)}.${quote(groupBy.column)}`;
          })
          .join(", ")}`
      : "";

    const orderBySql = params.plan.orderBy.length
      ? `ORDER BY ${params.plan.orderBy
          .map((orderBy) => {
            assertAllowedTableReference(orderBy.table);
            getColumn(orderBy.table, orderBy.column);
            return `${assignAlias(orderBy.table)}.${quote(orderBy.column)} ${orderBy.direction.toUpperCase()}`;
          })
          .join(", ")}`
      : "";

    values.push(Math.min(params.plan.limit, 100));

    const result: SqlQuery = {
      text: `
        SELECT ${params.plan.distinct ? "DISTINCT " : ""}${selectSql}
        FROM ${quote(baseTable.name)} ${baseAlias}
        ${joinSql}
        WHERE ${whereParts.join(" AND ")}
        ${groupBySql}
        ${orderBySql}
        LIMIT ?
      `,
      values,
      description: `dynamic_${params.plan.baseTable}`
    };

    logger.info({ sql: result.text, values: result.values, plan: params.plan }, "Generated Dynamic SQL Query");

    // Safety check: ensure at least one table has been filtered by tenant
    if (!whereParts.some((p) => p.includes(" = ?") || p.includes(" IN ("))) {
      logger.warn({ plan: params.plan }, "Query generated without explicit tenant filter on base table");
    }

    return result;
  }

  private buildAppointmentsQuery({ tenantId, intent, schema, timeZone }: BuildParams): SqlQuery {
    const appointments = schema.appointments;
    const patients = schema.patients;
    const doctors = schema.doctors;
    const range = resolveTimeRange(intent.timeRange, timeZone);

    const values: unknown[] = [tenantId];
    const where = [`a.${appointments.tenant} = ?`];

    if (range.start && range.end) {
      where.push(`a.${appointments.scheduledAt} >= ?`);
      where.push(`a.${appointments.scheduledAt} < ?`);
      values.push(range.start, range.end);
    }

    if (intent.doctorName) {
      where.push(`(LOWER(d.${doctors.firstName}) LIKE ? OR LOWER(d.${doctors.lastName}) LIKE ? OR LOWER(CONCAT(d.${doctors.firstName}, ' ', d.${doctors.lastName})) LIKE ?)`);
      const namePattern = `%${intent.doctorName.toLowerCase()}%`;
      values.push(namePattern, namePattern, namePattern);
    }

    if (intent.patientName) {
      where.push(`LOWER(a.${appointments.patientName}) LIKE ?`);
      values.push(`%${intent.patientName.toLowerCase()}%`);
    }

    values.push(intent.limit);

    return {
      text: `
        SELECT
          a.${appointments.id} AS appointment_id,
          a.${appointments.scheduledAt} AS scheduled_at,
          a.${appointments.isCompleted} AS status,
          a.${appointments.tokenNumber} AS token_number,
          COALESCE(a.${appointments.patientName}, CONCAT(p.${patients.firstName}, ' ', p.${patients.lastName})) AS patient_name,
          CONCAT(d.${doctors.firstName}, ' ', d.${doctors.lastName}) AS doctor_name
        FROM ${appointments.table} a
        LEFT JOIN ${patients.table} p
          ON p.${patients.id} = a.${appointments.patient}
         AND p.${patients.tenant} = a.${appointments.tenant}
        LEFT JOIN ${doctors.table} d
          ON d.${doctors.id} = a.${appointments.doctor}
         AND d.${doctors.tenant} = a.${appointments.tenant}
        WHERE ${where.join(" AND ")}
        ORDER BY a.${appointments.scheduledAt} ASC
        LIMIT ?
      `,
      values,
      description: "list_appointments"
    };
  }

  private buildPatientsQuery({ tenantId, intent, schema }: BuildParams): SqlQuery {
    const patients = schema.patients;
    const users = schema.users;
    const values: unknown[] = [tenantId];
    const where = [`p.${patients.tenant} = ?`];

    if (intent.patientName) {
      where.push(`(LOWER(p.${patients.firstName}) LIKE ? OR LOWER(u.${users.firstName}) LIKE ? OR LOWER(p.${patients.lastName}) LIKE ? OR LOWER(u.${users.lastName}) LIKE ?)`);
      const namePattern = `%${intent.patientName.toLowerCase()}%`;
      values.push(namePattern, namePattern, namePattern, namePattern);
    }

    values.push(intent.limit);

    return {
      text: `
        SELECT DISTINCT
          p.${patients.id} AS patient_id,
          COALESCE(CONCAT(u.${users.firstName}, ' ', u.${users.lastName}), CONCAT(p.${patients.firstName}, ' ', p.${patients.lastName})) AS patient_name,
          p.${patients.gender} AS gender,
          p.${patients.dob} AS date_of_birth
        FROM ${patients.table} p
        LEFT JOIN ${users.table} u ON u.${users.id} = p.${patients.user}
        WHERE ${where.join(" AND ")}
        ORDER BY patient_name ASC
        LIMIT ?
      `,
      values,
      description: "list_patients"
    };
  }


  private buildDoctorRankingQuery({ tenantId, intent, schema, timeZone }: BuildParams): SqlQuery {
    const appointments = schema.appointments;
    const doctors = schema.doctors;
    const range = resolveTimeRange(intent.timeRange, timeZone);
    const where = [`a.${appointments.tenant} = ?`];
    const values: unknown[] = [tenantId];

    if (range.start && range.end) {
      where.push(`a.${appointments.scheduledAt} >= ?`);
      where.push(`a.${appointments.scheduledAt} < ?`);
      values.push(range.start, range.end);
    }

    values.push(intent.limit);

    return {
      text: `
        SELECT
          d.${doctors.id} AS doctor_id,
          CONCAT(d.${doctors.firstName}, ' ', d.${doctors.lastName}) AS doctor_name,
          COUNT(*) AS appointment_count
        FROM ${appointments.table} a
        INNER JOIN ${doctors.table} d
          ON d.${doctors.id} = a.${appointments.doctor}
         AND d.${doctors.tenant} = a.${appointments.tenant}
        WHERE ${where.join(" AND ")}
        GROUP BY d.${doctors.id}, d.${doctors.firstName}, d.${doctors.lastName}
        ORDER BY appointment_count DESC, d.${doctors.firstName} ASC
        LIMIT ?
      `,
      values,
      description: "doctor_appointment_ranking"
    };
  }

  private buildDoctorsListQuery({ tenantId, intent, schema }: BuildParams): SqlQuery {
    const doctors = schema.doctors;
    const users = schema.users;
    const values: unknown[] = [tenantId];
    const where = [`d.${doctors.tenant} = ?`];

    if (intent.doctorName) {
      where.push(`(LOWER(d.${doctors.firstName}) LIKE ? OR LOWER(d.${doctors.lastName}) LIKE ? OR LOWER(u.${users.firstName}) LIKE ? OR LOWER(u.${users.lastName}) LIKE ?)`);
      const namePattern = `%${intent.doctorName.toLowerCase()}%`;
      values.push(namePattern, namePattern, namePattern, namePattern);
    }

    values.push(intent.limit);

    return {
      text: `
        SELECT
          d.${doctors.id} AS doctor_id,
          COALESCE(CONCAT(u.${users.firstName}, ' ', u.${users.lastName}), CONCAT(d.${doctors.firstName}, ' ', d.${doctors.lastName})) AS doctor_name,
          d.${doctors.specialty} AS specialist,
          d.${doctors.designation} AS designation
        FROM ${doctors.table} d
        LEFT JOIN ${users.table} u ON u.${users.id} = d.${doctors.user}
        WHERE ${where.join(" AND ")}
        ORDER BY doctor_name ASC
        LIMIT ?
      `,
      values,
      description: "list_doctors"
    };
  }

  private buildPrescriptionLookupQuery({ tenantId, intent, schema }: BuildParams): SqlQuery {
    const prescriptions = schema.prescriptions;
    const patients = schema.patients;
    const doctors = schema.doctors;
    const users = schema.users;
    const values: unknown[] = [tenantId];
    const where = [`rx.${prescriptions.tenant} = ?`];

    if (intent.patientName) {
      where.push(`(LOWER(p.${patients.firstName}) LIKE ? OR LOWER(p.${patients.lastName}) LIKE ? OR LOWER(CONCAT(p.${patients.firstName}, ' ', p.${patients.lastName})) LIKE ? OR LOWER(pu.${users.firstName}) LIKE ? OR LOWER(pu.${users.lastName}) LIKE ?)`);
      const namePattern = `%${intent.patientName.toLowerCase()}%`;
      values.push(namePattern, namePattern, namePattern, namePattern, namePattern);
    }

    if (intent.doctorName) {
      where.push(`(LOWER(d.${doctors.firstName}) LIKE ? OR LOWER(d.${doctors.lastName}) LIKE ? OR LOWER(CONCAT(d.${doctors.firstName}, ' ', d.${doctors.lastName})) LIKE ? OR LOWER(du.${users.firstName}) LIKE ? OR LOWER(du.${users.lastName}) LIKE ?)`);
      const namePattern = `%${intent.doctorName.toLowerCase()}%`;
      values.push(namePattern, namePattern, namePattern, namePattern, namePattern);
    }

    values.push(intent.limit);

    return {
      text: `
        SELECT
          rx.${prescriptions.id} AS prescription_id,
          rx.${prescriptions.status} AS status,
          rx.${prescriptions.createdAt} AS prescribed_at,
          COALESCE(CONCAT(pu.${users.firstName}, ' ', pu.${users.lastName}), CONCAT(p.${patients.firstName}, ' ', p.${patients.lastName})) AS patient_name,
          COALESCE(CONCAT(du.${users.firstName}, ' ', du.${users.lastName}), CONCAT(d.${doctors.firstName}, ' ', d.${doctors.lastName})) AS doctor_name
        FROM ${prescriptions.table} rx
        LEFT JOIN ${patients.table} p
          ON p.${patients.id} = rx.${prescriptions.patient}
         AND p.${patients.tenant} = rx.${prescriptions.tenant}
        LEFT JOIN ${users.table} pu ON pu.${users.id} = p.${patients.user}
        LEFT JOIN ${doctors.table} d
          ON d.${doctors.id} = rx.${prescriptions.doctor}
         AND d.${doctors.tenant} = rx.${prescriptions.tenant}
        LEFT JOIN ${users.table} du ON du.${users.id} = d.${doctors.user}
        WHERE ${where.join(" AND ")}
        ORDER BY rx.${prescriptions.updatedAt} DESC
        LIMIT ?
      `,
      values,
      description: "prescription_lookup"
    };
  }

  private buildMedicinesQuery({ tenantId, intent, schema }: BuildParams): SqlQuery {
    const medicines = schema.medicines;
    const values: unknown[] = [tenantId];
    const where = [`m.${medicines.tenant} = ?`];

    if (intent.condition) {
      where.push(`LOWER(m.${medicines.name}) LIKE ?`);
      values.push(`%${intent.condition.toLowerCase()}%`);
    }

    values.push(intent.limit);

    return {
      text: `
        SELECT
          m.${medicines.id} AS medicine_id,
          m.${medicines.name} AS medicine_name,
          m.${medicines.sellingPrice} AS price,
          m.${medicines.quantity} AS available_quantity
        FROM ${medicines.table} m
        WHERE ${where.join(" AND ")}
        ORDER BY m.${medicines.name} ASC
        LIMIT ?
      `,
      values,
      description: "list_medicines"
    };
  }

  private buildDependentsQuery({ tenantId, intent, schema }: BuildParams): SqlQuery {
    const dependents = schema.dependents;
    const patients = schema.patients;
    const values: unknown[] = [tenantId];
    // dependents don't have tenant_id, so we join with patients
    const where = [`p.${patients.tenant} = ?`];

    if (intent.patientName) {
      where.push(`(LOWER(p.${patients.firstName}) LIKE ? OR LOWER(d.${dependents.firstName}) LIKE ?)`);
      values.push(`%${intent.patientName.toLowerCase()}%`, `%${intent.patientName.toLowerCase()}%`);
    }

    values.push(intent.limit);

    return {
      text: `
        SELECT
          d.${dependents.id} AS dependent_id,
          CONCAT(d.${dependents.firstName}, ' ', d.${dependents.lastName}) AS dependent_name,
          d.${dependents.relation} AS relation,
          d.${dependents.age} AS age,
          CONCAT(p.${patients.firstName}, ' ', p.${patients.lastName}) AS patient_name
        FROM ${dependents.table} d
        INNER JOIN ${patients.table} p ON p.${patients.id} = d.${dependents.patient}
        WHERE ${where.join(" AND ")}
        ORDER BY d.${dependents.firstName} ASC
        LIMIT ?
      `,
      values,
      description: "list_dependents"
    };
  }

  private buildSchedulesQuery({ tenantId, intent, schema }: BuildParams): SqlQuery {
    const schedules = schema.schedules;
    const scheduleDays = schema.scheduleDays;
    const doctors = schema.doctors;
    const values: unknown[] = [tenantId];
    const where = [`s.${schedules.tenant} = ?`];

    if (intent.doctorName) {
      where.push(`(LOWER(dr.${doctors.firstName}) LIKE ? OR LOWER(dr.${doctors.lastName}) LIKE ? OR LOWER(CONCAT(dr.${doctors.firstName}, ' ', dr.${doctors.lastName})) LIKE ?)`);
      const namePattern = `%${intent.doctorName.toLowerCase()}%`;
      values.push(namePattern, namePattern, namePattern);
    }

    values.push(intent.limit);

    return {
      text: `
        SELECT
          s.${schedules.id} AS schedule_id,
          CONCAT(dr.${doctors.firstName}, ' ', dr.${doctors.lastName}) AS doctor_name,
          sd.${scheduleDays.availableOn} AS day,
          sd.${scheduleDays.availableFrom} AS start_time,
          sd.${scheduleDays.availableTo} AS end_time,
          sd.${scheduleDays.maxTokens} AS max_tokens
        FROM ${schedules.table} s
        INNER JOIN ${scheduleDays.table} sd ON sd.${scheduleDays.schedule} = s.${schedules.id}
        INNER JOIN ${doctors.table} dr ON dr.${doctors.id} = s.${schedules.doctor}
        WHERE ${where.join(" AND ")}
        ORDER BY dr.${doctors.firstName} ASC, sd.${scheduleDays.id} ASC
        LIMIT ?
      `,
      values,
      description: "list_schedules"
    };
  }
}
