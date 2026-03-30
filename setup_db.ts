import { DatabaseClient } from './src/db/client.ts';

async function setup() {
    const db = new DatabaseClient();
    try {
        console.log("Creating ai_chat_sessions table...");
        await db.mysqlPool.query(`
            CREATE TABLE IF NOT EXISTS ai_chat_sessions (
                id VARCHAR(36) PRIMARY KEY,
                tenant_id VARCHAR(128) NOT NULL,
                title VARCHAR(255) NOT NULL DEFAULT 'New Chat',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_tenant (tenant_id)
            )
        `);

        console.log("Creating ai_chat_messages table...");
        await db.mysqlPool.query(`
            CREATE TABLE IF NOT EXISTS ai_chat_messages (
                id VARCHAR(36) PRIMARY KEY,
                tenant_id VARCHAR(128) NOT NULL,
                session_id VARCHAR(36) NOT NULL,
                role ENUM('user', 'assistant') NOT NULL,
                content JSON NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_session (session_id)
            )
        `);

        console.log("Tables created successfully.");
    } catch (e) {
        console.error("Failed to create tables:", e);
    } finally {
        await db.close();
        process.exit(0);
    }
}

setup();
