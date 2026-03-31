import type { DatabaseClient } from "../db/client.ts";

export interface DiscoveredColumn {
  name: string;
  dataType: string;
  isNullable: boolean;
  isPrimaryKey: boolean;
}

export interface DiscoveredTable {
  name: string;
  tenant: string;
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
      const tenantColumn = columns.find((c) => c.name === "tenant_id");

      schema[tableName] = {
        name: tableName,
        tenant: tenantColumn ? "tenant_id" : (null as unknown as string),
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

  /**
   * Focuses the schema summary on the target table to reduce token count.
   */
  formatPrunedSchemaSummary(schema: DiscoveredSchema, target?: string): string {
    const tableNames = Object.keys(schema).sort();
    const normalizedTarget = target?.toLowerCase().replace(/s$/, "");

    // High-priority tables that should always have full columns if they are the target or related
    const coreTables = ["patient", "doctor", "appointment", "prescription", "medicine"];
    
    return tableNames
      .map((tableName) => {
        const table = schema[tableName]!;
        const isTarget = normalizedTarget && (tableName.toLowerCase().includes(normalizedTarget) || normalizedTarget.includes(tableName.toLowerCase()));
        
        // If it's the target table, or a core table related to the target, show all columns
        // Otherwise, just show the table name to save tokens
        if (isTarget || (normalizedTarget && coreTables.includes(tableName.toLowerCase().replace(/s$/, "")))) {
          const columns = table.columns.map((column) => `${column.name}:${column.dataType}`).join(", ");
          return `${table.name}(${columns})`;
        }
        
        return `${table.name}([only essential columns available])`;
      })
      .join("\n");
  }
}
