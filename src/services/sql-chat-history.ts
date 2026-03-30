import { BaseListChatMessageHistory } from "@langchain/core/chat_history";
import {
  BaseMessage,
  HumanMessage,
  AIMessage,
  SystemMessage,
  ChatMessage,
} from "@langchain/core/messages";
import type { DatabaseClient } from "../db/client.ts";
import { randomUUID } from "node:crypto";
import { logger } from "../utils/logger.ts";

export class SqlChatMessageHistory extends BaseListChatMessageHistory {
  override lc_namespace = ["langchain", "stores", "message", "sql"];

  constructor(
    private readonly db: DatabaseClient,
    private readonly tenantId: string,
    private readonly sessionId: string,
    private readonly limit: number = 20
  ) {
    super();
  }

  override async getMessages(): Promise<BaseMessage[]> {
    try {
      const res = await this.db.query<any>({
        text: `
          SELECT role, content 
          FROM ai_chat_messages 
          WHERE tenant_id = ? AND session_id = ? 
          ORDER BY created_at ASC 
          LIMIT ?
        `,
        values: [this.tenantId, this.sessionId, this.limit],
        description: "get_chat_history",
      });

      return res.rows.map((row: any) => {
        const content = typeof row.content === 'string' ? JSON.parse(row.content).text : row.content.text;
        
        switch (row.role) {
          case "user":
            return new HumanMessage(content);
          case "assistant":
            return new AIMessage(content);
          case "system":
            return new SystemMessage(content);
          default:
            return new ChatMessage(content, row.role);
        }
      });
    } catch (error) {
      logger.error({ error, sessionId: this.sessionId }, "Failed to fetch chat history from SQL");
      return [];
    }
  }

  override async addMessage(message: BaseMessage): Promise<void> {
    const role = message._getType() === "human" ? "user" : "assistant";
    const content = JSON.stringify({ text: message.content });

    try {
      await this.db.query({
        text: `
          INSERT INTO ai_chat_messages (id, tenant_id, session_id, role, content, created_at)
          VALUES (?, ?, ?, ?, ?, NOW())
        `,
        values: [randomUUID(), this.tenantId, this.sessionId, role, content],
        description: "save_chat_message",
      });
    } catch (error) {
      logger.error({ error, sessionId: this.sessionId }, "Failed to save chat message to SQL");
    }
  }

  override async clear(): Promise<void> {
    try {
      await this.db.query({
        text: `DELETE FROM ai_chat_messages WHERE tenant_id = ? AND session_id = ?`,
        values: [this.tenantId, this.sessionId],
        description: "clear_chat_history",
      });
    } catch (error) {
      logger.error({ error, sessionId: this.sessionId }, "Failed to clear chat history from SQL");
    }
  }
}
