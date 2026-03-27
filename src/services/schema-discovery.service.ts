import type { DatabaseClient } from "../db/client.ts";

export interface DiscoveredColumn {
  name: string;
  dataType: string;
  isNullable: boolean;
  isPrimaryKey: boolean;
}

export interface DiscoveredTable {
  name: string;
  tenantColumn: string;
  columns: DiscoveredColumn[];
}

export type DiscoveredSchema = Record<string, DiscoveredTable>;

interface SchemaRow {
  [key: string]: unknown;
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_key: string | null;
}

export class SchemaDiscoveryService {
  private cachedSchema: DiscoveredSchema | null = null;
  private cachedAt = 0;
  private readonly cacheTtlMs = 5 * 60 * 1000;

  constructor(private readonly db: DatabaseClient) {}

  async getAccessibleSchema(forceRefresh = false): Promise<DiscoveredSchema> {
    const now = Date.now();
    if (!forceRefresh && this.cachedSchema && now - this.cachedAt < this.cacheTtlMs) {
      return this.cachedSchema;
    }

    const result = await this.db.query<SchemaRow>({
      text: `
        SELECT
          table_name,
          column_name,
          data_type,
          is_nullable,
          column_key
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
        ORDER BY table_name ASC, ordinal_position ASC
      `,
      values: [],
      description: "discover_accessible_schema"
    });

    const grouped = new Map<string, DiscoveredColumn[]>();

    for (const row of result.rows) {
      const table = row.table_name;
      const existing = grouped.get(table) ?? [];
      existing.push({
        name: row.column_name,
        dataType: row.data_type,
        isNullable: row.is_nullable === "YES",
        isPrimaryKey: row.column_key === "PRI"
      });
      grouped.set(table, existing);
    }

    const schema: DiscoveredSchema = {};

    for (const [tableName, columns] of grouped.entries()) {
      if (!columns.some((column) => column.name === "tenant_id")) {
        continue;
      }

      schema[tableName] = {
        name: tableName,
        tenantColumn: "tenant_id",
        columns
      };
    }

    this.cachedSchema = schema;
    this.cachedAt = now;
    return schema;
  }

  formatSchemaSummary(schema: DiscoveredSchema): string {
    const tableNames = Object.keys(schema).sort();
    return tableNames
      .map((tableName) => {
        const table = schema[tableName]!;
        const columns = table.columns.map((column) => `${column.name}:${column.dataType}`).join(", ");
        return `${table.name}(${columns})`;
      })
      .join("\n");
  }
}
