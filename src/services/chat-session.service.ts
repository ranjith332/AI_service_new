import { randomUUID } from "node:crypto";
import type { DatabaseClient, QueryResultRow } from "../db/client.ts";
import { logger } from "../utils/logger.ts";

export interface ChatSession extends QueryResultRow {
  id: string;
  tenantId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export class ChatSessionService {
  constructor(private readonly db: DatabaseClient) {}

  async createSession(tenantId: string, initialMessage?: string): Promise<ChatSession> {
    const id = randomUUID();
    let title = "New Chat";

    if (initialMessage) {
      // Auto-title generation from the first 40 characters
      title = initialMessage.length > 40 
        ? initialMessage.substring(0, 37) + "..." 
        : initialMessage;
    }

    try {
      await this.db.query({
        text: `INSERT INTO ai_chat_sessions (id, tenant_id, title, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())`,
        values: [id, tenantId, title],
        description: "create_chat_session"
      });

      return {
        id,
        tenantId,
        title,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    } catch (error) {
      logger.error({ error, tenantId }, "Failed to create chat session");
      throw error;
    }
  }

  async listSessions(tenantId: string): Promise<ChatSession[]> {
    try {
      const res = await this.db.query<ChatSession>({
        text: `SELECT id, tenant_id as tenantId, title, created_at as createdAt, updated_at as updatedAt FROM ai_chat_sessions WHERE tenant_id = ? ORDER BY updated_at DESC`,
        values: [tenantId],
        description: "list_chat_sessions"
      });
      return res.rows;
    } catch (error) {
      logger.error({ error, tenantId }, "Failed to list chat sessions");
      return [];
    }
  }

  async getSession(tenantId: string, sessionId: string): Promise<ChatSession | null> {
    try {
      const res = await this.db.query<ChatSession>({
        text: `SELECT id, tenant_id as tenantId, title, created_at as createdAt, updated_at as updatedAt FROM ai_chat_sessions WHERE tenant_id = ? AND id = ?`,
        values: [tenantId, sessionId],
        description: "get_chat_session"
      });
      return res.rows[0] || null;
    } catch (error) {
      logger.error({ error, sessionId }, "Failed to get chat session");
      return null;
    }
  }

  async renameSession(tenantId: string, sessionId: string, title: string): Promise<void> {
    try {
      await this.db.query({
        text: `UPDATE ai_chat_sessions SET title = ?, updated_at = NOW() WHERE tenant_id = ? AND id = ?`,
        values: [title, tenantId, sessionId],
        description: "rename_chat_session"
      });
    } catch (error) {
      logger.error({ error, sessionId }, "Failed to rename chat session");
      throw error;
    }
  }

  async deleteSession(tenantId: string, sessionId: string): Promise<void> {
    try {
      // 1. Delete all messages for this session
      await this.db.query({
        text: `DELETE FROM ai_chat_messages WHERE tenant_id = ? AND session_id = ?`,
        values: [tenantId, sessionId],
        description: "delete_session_messages"
      });

      // 2. Delete the session itself
      await this.db.query({
        text: `DELETE FROM ai_chat_sessions WHERE tenant_id = ? AND id = ?`,
        values: [tenantId, sessionId],
        description: "delete_chat_session"
      });
    } catch (error) {
      logger.error({ error, sessionId }, "Failed to delete chat session");
      throw error;
    }
  }

  async updateLastActivity(tenantId: string, sessionId: string): Promise<void> {
    try {
      await this.db.query({
        text: `UPDATE ai_chat_sessions SET updated_at = NOW() WHERE tenant_id = ? AND id = ?`,
        values: [tenantId, sessionId],
        description: "update_session_activity"
      });
    } catch (error) {
       // Silent fail
    }
  }
}
