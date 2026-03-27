import type { DatabaseClient, QueryResultRow } from "../db/client.ts";
import type { SqlQuery } from "../db/client.ts";

export class DbExecutorService {
  constructor(private readonly db: DatabaseClient) {}

  async execute<T extends QueryResultRow = QueryResultRow>(query: SqlQuery) {
    return this.db.query<T>(query);
  }
}
