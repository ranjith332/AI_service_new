import { createApp } from "./src/app.ts";
import { logger } from "./src/utils/logger.ts";

async function testPersistence() {
    const { app } = await createApp();
    const tenantId = "bc2428a0-604b-45c9-a04b-01e390ccace8";
    
    logger.info("--- Phase 1: New Chat (No Session ID) ---");
    const response1 = await app.handle(new Request("http://localhost/ai/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            tenant_id: tenantId,
            user_query: "Who is doctor Raju Boy?"
        })
    }));

    if (!response1.ok) {
        const errText = await response1.text();
        console.error("Phase 1 Failed:", response1.status, errText);
        process.exit(1);
    }

    const res1: any = await response1.json();
    const sessionId = res1.session_id;
    logger.info({ sessionId, answer: res1.answer }, "First Response Received");

    if (!sessionId) {
        throw new Error("Session ID was not generated!");
    }

    logger.info("--- Phase 2: Follow-up Chat (With Session ID) ---");
    const response2 = await app.handle(new Request("http://localhost/ai/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            tenant_id: tenantId,
            session_id: sessionId,
            user_query: "What is his specialty?"
        })
    }));

    if (!response2.ok) {
        const errText = await response2.text();
        logger.error({ status: response2.status, errText }, "Phase 2 Failed");
        process.exit(1);
    }

    const res2: any = await response2.json();
    logger.info({ answer: res2.answer }, "Follow-up Response Received");

    logger.info("--- Phase 3: Check Sidebar (List Sessions) ---");
    const response3 = await app.handle(new Request(`http://localhost/ai/sessions?tenant_id=${tenantId}`));
    if (!response3.ok) {
        const errText = await response3.text();
        logger.error({ status: response3.status, errText }, "Phase 3 Failed");
        process.exit(1);
    }
    const sessions: any = await response3.json();
    logger.info({ sessionsCount: sessions.length, lastSession: sessions[0] }, "Sessions Listed");

    logger.info("--- Phase 4: Fetch History ---");
    const response4 = await app.handle(new Request(`http://localhost/ai/sessions/${sessionId}/messages?tenant_id=${tenantId}`));
    if (!response4.ok) {
        const errText = await response4.text();
        logger.error({ status: response4.status, errText }, "Phase 4 Failed");
        process.exit(1);
    }
    const history: any = await response4.json();
    logger.info({ historyLength: history.length }, "History Retrieved");

    process.exit(0);
}

testPersistence().catch(err => {
    console.error(err);
    process.exit(1);
});
