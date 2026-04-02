import { DatabaseClient, type SqlQuery } from "../db/client.ts";
import { logger } from "../utils/logger.ts";

export class DbExecutorService {
  constructor(private readonly db: DatabaseClient) {}

  async execute(query: SqlQuery) {
    logger.info({ query: query.text, description: query.description }, "Executing DB query");
    try {
      return await this.db.query(query);
    } catch (error: any) {
      logger.error({ error: error.message }, "Query execution failed");
      throw error;
    }
  }
}
