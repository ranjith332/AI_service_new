import { createPool, type Pool, type PoolOptions } from "mysql2/promise";
import { env } from "../config/env.ts";
import { logger } from "../utils/logger.ts";

export interface SqlQuery {
  text: string;
  values?: any[];
  description?: string;
}

export type QueryResultRow = Record<string, any>;

export interface QueryResult<T extends QueryResultRow = QueryResultRow> {
  rows: T[];
  rowCount: number;
}

export class DatabaseClient {
  private pool: Pool;

  constructor(options: Partial<PoolOptions> = {}) {
    logger.info({ 
        host: env.DB_HOST, 
        user: env.DB_USER, 
        database: env.DB_NAME,
        port: env.DB_PORT 
    }, "Initializing Database Pool...");

    this.pool = createPool({
      host: env.DB_HOST,
      port: parseInt(env.DB_PORT),
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      database: env.DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
      connectTimeout: 10000,
      ssl: false,
      ...options,
    });
  }

  async query<T extends QueryResultRow = QueryResultRow>(
    query: SqlQuery,
  ): Promise<QueryResult<T>> {
    const start = Date.now();
    try {
      const [rows] = await this.pool.query(query.text, query.values);
      const duration = Date.now() - start;

      logger.info(
        {
          description: query.description,
          duration,
          rowCount: Array.isArray(rows) ? rows.length : 0,
        },
        "Database query executed",
      );

      return {
        rows: Array.isArray(rows) ? (rows as T[]) : [],
        rowCount: Array.isArray(rows) ? rows.length : 0,
      };
    } catch (error: any) {
      logger.error(
        { 
          error: error.message, 
          code: error.code, 
          errno: error.errno, 
          sql: query.text,
          host: env.DB_HOST,
          user: env.DB_USER
        }, 
        "Database query failed"
      );
      throw error;
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
