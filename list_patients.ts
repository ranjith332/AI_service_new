import { DatabaseClient } from "./src/db/client.ts";

async function listPatients() {
    const db = new DatabaseClient();
    console.log("Listing ALL patients...");
    const res = await db.query<any>({
        text: `
            SELECT p.id, p.first_name AS pf, p.last_name AS pl, u.first_name AS uf, u.last_name AS ul, p.tenant_id
            FROM patients p
            LEFT JOIN users u ON u.id = p.user_id
        `,
        values: [],
        description: "list_all_patients_debug"
    });

    res.rows.forEach(r => {
        const name = `${r.uf || r.pf || ''} ${r.ul || r.pl || ''}`.trim();
        console.log(`${name} | ${r.tenant_id}`);
    });
    await db.close();
}

listPatients().catch(console.error);
