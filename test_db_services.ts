import { DatabaseClient } from './src/db/client.ts';
import { ChatSessionService } from './src/services/chat-session.service.ts';
import { SqlChatMessageHistory } from './src/services/sql-chat-history.ts';
import { HumanMessage, AIMessage } from '@langchain/core/messages';

async function testDBServices() {
    const db = new DatabaseClient();
    const chatService = new ChatSessionService(db);
    const tenantId = "test-tenant-" + Date.now();
    
    try {
        console.log("--- 1. Testing Session Creation ---");
        const session = await chatService.createSession(tenantId, "Hello, I am testing persistent chat.");
        console.log("Created Session:", session.id, "Title:", session.title);

        console.log("--- 2. Testing Message Storage ---");
        const history = new SqlChatMessageHistory(db, tenantId, session.id);
        await history.addMessage(new HumanMessage("Hello AI!"));
        await history.addMessage(new AIMessage("Hello human, I will remember this."));
        
        console.log("--- 3. Testing History Retrieval ---");
        const messages = await history.getMessages();
        console.log("Retrieved Messages Count:", messages.length);
        messages.forEach((m, i) => console.log(`${i+1}. [${m._getType()}]: ${m.content}`));

        console.log("--- 4. Testing Session Listing ---");
        const sessions = await chatService.listSessions(tenantId);
        console.log("Sessions for tenant:", sessions.length);

        console.log("--- 5. Testing Deletion ---");
        await chatService.deleteSession(tenantId, session.id);
        const sessionsAfter = await chatService.listSessions(tenantId);
        console.log("Sessions after deletion:", sessionsAfter.length);

        console.log("\n✅ DB Services Test Passed!");
    } catch (e) {
        console.error("❌ DB Services Test Failed:", e);
    } finally {
        await db.close();
        process.exit(0);
    }
}

testDBServices();
