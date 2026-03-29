import { DatabaseClient } from "./src/db/client";

const db = new DatabaseClient();
const res = await db.query({ 
    text: "SELECT available_on, available_from, available_to FROM schedule_days WHERE schedule_id = 32 AND available_on = ?", 
    values: ["Sunday"], 
    description: "check_sunday_times" 
});
console.log(JSON.stringify(res.rows, null, 2));
await db.close();
