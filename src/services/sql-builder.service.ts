import type { SchemaMapping } from "../db/schema-mapping.ts";
import type { SqlQuery } from "../db/client.ts";
import type { DynamicSqlPlan, QueryIntent } from "./query-schemas.ts";
import type { DiscoveredSchema } from "./schema-discovery.service.ts";
import { UnsupportedQueryError } from "../utils/errors.ts";
import { resolveTimeRange } from "../utils/time.ts";

interface BuildParams {
  tenantId: string;
  intent: QueryIntent;
  schema: SchemaMapping;
  timeZone: string;
}

export class SqlBuilderService {
  build(params: BuildParams): SqlQuery {
    const { intent } = params;

    if (intent.target === "appointments") {
      return this.buildAppointmentsQuery(params);
    }

    if (intent.target === "patients") {
      return this.buildPatientsQuery(params);
    }

    if (intent.target === "doctors" || intent.metric === "doctor_with_most_appointments") {
      return this.buildDoctorRankingQuery(params);
    }

    if (intent.target === "prescriptions" || intent.target === "prescription") {
      return this.buildPrescriptionLookupQuery(params);
    }

    if (intent.target === "medicines") {
      return this.buildMedicinesQuery(params);
    }

    throw new UnsupportedQueryError();
  }

  buildDynamic(params: {
    tenantId: string;
    plan: DynamicSqlPlan;
    discoveredSchema: DiscoveredSchema;
  }): SqlQuery {
    const schema = params.discoveredSchema;
    const baseTable = schema[params.plan.baseTable];
    if (!baseTable) {
      throw new UnsupportedQueryError(`Unknown base table ${params.plan.baseTable}.`);
    }

    const aliasByTable = new Map<string, string>();
    const values: unknown[] = [];
    let aliasIndex = 0;

    const assignAlias = (tableName: string) => {
      const existing = aliasByTable.get(tableName);
      if (existing) {
        return existing;
      }

      const alias = `t${aliasIndex}`;
      aliasIndex += 1;
      aliasByTable.set(tableName, alias);
      return alias;
    };

    const getColumn = (tableName: string, columnName: string) => {
      const table = schema[tableName];
      if (!table) {
        throw new UnsupportedQueryError(`Table ${tableName} is not allowed.`);
      }

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
    const allowedTables = new Set<string>([baseTable.name, ...params.plan.joins.map((join) => join.table)]);

    const assertAllowedTableReference = (tableName: string) => {
      if (!allowedTables.has(tableName)) {
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
        const table = schema[join.table];
        if (!table) {
          throw new UnsupportedQueryError(`Join table ${join.table} is not allowed.`);
        }

        const joinAlias = assignAlias(table.name);
        const predicates = join.on.map((condition) => {
          assertAllowedTableReference(condition.leftTable);
          assertAllowedTableReference(condition.rightTable);
          getColumn(condition.leftTable, condition.leftColumn);
          getColumn(condition.rightTable, condition.rightColumn);
          const leftAlias = assignAlias(condition.leftTable);
          const rightAlias = assignAlias(condition.rightTable);
          return `${leftAlias}.${quote(condition.leftColumn)} = ${rightAlias}.${quote(condition.rightColumn)}`;
        });

        predicates.push(`${joinAlias}.${quote(table.tenant)} = ?`);
        values.push(params.tenantId);

        return `${join.joinType.toUpperCase()} JOIN ${quote(table.name)} ${joinAlias} ON ${predicates.join(" AND ")}`;
      })
      .join("\n");

    const whereParts = [`${baseAlias}.${quote(baseTable.tenant)} = ?`];
    values.push(params.tenantId);

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

    return {
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
      where.push(`LOWER(d.${doctors.firstName}) LIKE ?`);
      values.push(`%${intent.doctorName.toLowerCase()}%`);
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
          a.${appointments.patientName} AS patient_name,
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
    const values: unknown[] = [tenantId];
    const where = [`p.${patients.tenant} = ?`];

    if (intent.patientName) {
      where.push(`LOWER(p.${patients.firstName}) LIKE ?`);
      values.push(`%${intent.patientName.toLowerCase()}%`);
    }

    values.push(intent.limit);

    return {
      text: `
        SELECT DISTINCT
          p.${patients.id} AS patient_id,
          CONCAT(p.${patients.firstName}, ' ', p.${patients.lastName}) AS patient_name,
          p.${patients.gender} AS gender,
          p.${patients.dob} AS date_of_birth
        FROM ${patients.table} p
        WHERE ${where.join(" AND ")}
        ORDER BY p.${patients.firstName} ASC
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

  private buildPrescriptionLookupQuery({ tenantId, intent, schema }: BuildParams): SqlQuery {
    const prescriptions = schema.prescriptions;
    const patients = schema.patients;
    const doctors = schema.doctors;
    const values: unknown[] = [tenantId];
    const where = [`rx.${prescriptions.tenant} = ?`];

    if (intent.patientName) {
      where.push(`LOWER(p.${patients.firstName}) LIKE ?`);
      values.push(`%${intent.patientName.toLowerCase()}%`);
    }

    if (intent.doctorName) {
      where.push(`LOWER(d.${doctors.firstName}) LIKE ?`);
      values.push(`%${intent.doctorName.toLowerCase()}%`);
    }

    values.push(intent.limit);

    return {
      text: `
        SELECT
          rx.${prescriptions.id} AS prescription_id,
          rx.${prescriptions.status} AS status,
          rx.${prescriptions.createdAt} AS prescribed_at,
          CONCAT(p.${patients.firstName}, ' ', p.${patients.lastName}) AS patient_name,
          CONCAT(d.${doctors.firstName}, ' ', d.${doctors.lastName}) AS doctor_name
        FROM ${prescriptions.table} rx
        LEFT JOIN ${patients.table} p
          ON p.${patients.id} = rx.${prescriptions.patient}
         AND p.${patients.tenant} = rx.${prescriptions.tenant}
        LEFT JOIN ${doctors.table} d
          ON d.${doctors.id} = rx.${prescriptions.doctor}
         AND d.${doctors.tenant} = rx.${prescriptions.tenant}
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
}
