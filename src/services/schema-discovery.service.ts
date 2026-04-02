import { DatabaseClient, type SqlQuery } from "../db/client.ts";
import { logger } from "../utils/logger.ts";

export class SchemaDiscoveryService {
  constructor(private readonly db: DatabaseClient) {}

  async discover() {
    logger.info("Discovering database schema");
    const query: SqlQuery = {
      text: "SHOW TABLES",
    };
    const result = await this.db.query(query);
    return result.rows.map((row) => Object.values(row)[0]);
  }

  async getTableColumns(tableName: string) {
    const query: SqlQuery = {
      text: `SHOW COLUMNS FROM ${tableName}`,
    };
    const result = await this.db.query(query);
    return result.rows;
  }
}
