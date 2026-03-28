import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import { createPool as createMysqlPool, type Pool as MysqlPool } from "mysql2/promise";

import { env } from "../config/env.ts";
import { logger } from "../utils/logger.ts";
import * as schema from "./schema.ts";

export interface SqlQuery {
  text: string;
  values: unknown[];
  description: string;
}

export interface QueryResultRow {
  [key: string]: unknown;
}

export interface SqlExecutionResult<T extends QueryResultRow = QueryResultRow> {
  rows: T[];
  rowCount: number;
}

export class DatabaseClient {
  public readonly mysqlPool: MysqlPool;
  public readonly orm: MySql2Database<typeof schema>;

  constructor() {
    this.mysqlPool = createMysqlPool({
      uri: env.DATABASE_URL,
      connectionLimit: env.DB_POOL_MAX,
      waitForConnections: true,
      queueLimit: 0
    });

    this.orm = drizzle(this.mysqlPool, {
      schema,
      mode: "default"
    });
  }

  async query<T extends QueryResultRow = QueryResultRow>(query: SqlQuery): Promise<SqlExecutionResult<T>> {
    logger.debug(
      {
        description: query.description,
        valueCount: query.values.length
      },
      "Executing tenant-safe SQL query"
    );

    const [rows] = await this.mysqlPool.query(query.text, query.values);
    const output = rows as T[];

    logger.debug(
      {
        description: query.description,
        rowCount: output.length,
        rows: output // Log the actual results for visibility
      },
      "SQL query execution complete"
    );

    return {
      rows: output,
      rowCount: output.length
    };
  }

  async close(): Promise<void> {
    await this.mysqlPool.end();
  }
}
