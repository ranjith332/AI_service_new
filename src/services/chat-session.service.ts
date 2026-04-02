import { logger } from "../utils/logger.ts";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export class ChatSessionService {
  private sessions = new Map<string, ChatMessage[]>();

  async getHistory(sessionId: string): Promise<string> {
    const history = this.sessions.get(sessionId) || [];
    return history
      .map((msg) => `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`)
      .join("\n");
  }

  async addMessage(sessionId: string, message: ChatMessage): Promise<void> {
    const history = this.sessions.get(sessionId) || [];
    history.push(message);
    
    // Limit history to last 10 messages
    if (history.length > 10) {
      history.shift();
    }
    
    this.sessions.set(sessionId, history);
    logger.info({ sessionId, role: message.role }, "Message added to session");
  }

  async clearSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
    logger.info({ sessionId }, "Session cleared");
  }
}
