import { DatabaseClient } from "../src/db/client.ts";
import { QdrantClient } from "@qdrant/js-client-rest";
import { env } from "../src/config/env.ts";
import { logger } from "../src/utils/logger.ts";
import { SCHEMA_MAPPING } from "../src/db/schema-mapping.ts";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

// Ensure storage directory exists
const STORAGE_DIR = path.join(process.cwd(), "storage");
if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

const STATE_FILE = env.INGESTION_STATE_PATH || path.join(STORAGE_DIR, "ingestion-state.json");

// Utility to clean values and skip non-searchable data
function cleanValue(key: string, value: any): string | null {
    if (value === null || value === undefined) return null;
    const str = String(value).trim();
    
    // Skip extremely long technical strings, base64, or hashes which cause NIM errors
    if (str.length > 500) return null; 
    if (/^[a-f0-9]{32,}$/i.test(str)) return null; // UUIDs/Hashes
    if (str.includes("data:image")) return null; // Base64 images
    if (key.toLowerCase().includes("token") || key.toLowerCase().includes("path") || key.toLowerCase().includes("url")) return null;

    return str;
}

// Generate a stable UUID for Qdrant updates
function getStableId(table: string, id: string | number, tenantId: string): string {
    const key = `${table}:${tenantId}:${id}`;
    return crypto.createHash('md5').update(key).digest('hex').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5");
}

// Utility to load local schema mapping
function loadSchemaMapping() {
    const localPath = path.join(process.cwd(), "config", "schema-mapping.local.json");
    logger.info({ localPath }, "Loading schema mapping...");
    let rawMapping;
    if (fs.existsSync(localPath)) {
        try {
            const buffer = fs.readFileSync(localPath);
            const content = buffer.toString('utf8').trim();
            // Remove BOM if present
            const sanitized = content.replace(/^\uFEFF/, "");
            rawMapping = JSON.parse(sanitized);
        } catch (e: any) {
            logger.error({ localPath, error: e.message }, "Failed to parse local mapping, using default.");
            rawMapping = SCHEMA_MAPPING;
        }
    } else {
        rawMapping = SCHEMA_MAPPING;
    }

    const transformed: any = {};
    for (const entity in rawMapping) {
        const config = rawMapping[entity];
        if (config.table) {
            const cols = Object.keys(config).filter(k => k !== "table" && !k.toLowerCase().includes("password"));
            transformed[entity] = {
                table: config.table,
                columns: cols.map(k => config[k]),
                rawConfig: config
            };
        } else {
            transformed[entity] = {
                table: config.table,
                columns: config.columns,
                rawConfig: config.columns.reduce((acc: any, col: string) => ({ ...acc, [col]: col }), { table: config.table })
            };
        }
    }
    return transformed;
}

const ACTIVE_MAPPING = loadSchemaMapping();

// Using a simple fetch for embeddings
async function generateEmbedding(text: string): Promise<number[]> {
    const models = [env.NVIDIA_EMBEDDING_MODEL, "nvidia/llama-3.2-nv-embedqa-1b-v2"];
    let lastError = "";

    for (const model of models) {
        try {
            const response = await fetch(`${env.NVIDIA_QWEN_BASE_URL}/embeddings`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${env.NVIDIA_QWEN_API_KEY}`
                },
                body: JSON.stringify({
                    input: [text],
                    model: model,
                    encoding_format: "float",
                    input_type: "passage"
                })
            });

            if (response.ok) {
                const data = await response.json() as any;
                return data.data[0].embedding;
            }

            const errorText = await response.text();
            lastError = `Model ${model} failed: ${errorText}`;
            logger.warn({ model, error: errorText }, "Embedding attempt failed");
        } catch (e: any) {
            lastError = e.message;
        }
    }
    throw new Error(`All NVIDIA Embedding attempts failed. Last error: ${lastError}`);
}

async function ingest() {
    const args = process.argv.slice(2);
    const tenantArg = args.find(a => a.startsWith("--tenant="))?.split("=")[1];
    const tableArg = args.find(a => a.startsWith("--table="))?.split("=")[1];
    const forceResync = args.includes("--resync");

    const db = new DatabaseClient();
    const qdrant = new QdrantClient({
        url: env.QDRANT_URL,
        apiKey: env.QDRANT_API_KEY
    });

    const tablesToIngest = tableArg ? [tableArg] : Object.keys(ACTIVE_MAPPING);
    const collectionName = env.QDRANT_COLLECTION;

    // Load synchronization state
    let state: Record<string, string> = {};
    if (fs.existsSync(STATE_FILE) && !forceResync) {
        state = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    }

    logger.info({ tablesToIngest, tenantArg, resync: forceResync }, "Starting ingestion...");

    // Ensure collection exists
    try {
        await qdrant.getCollection(collectionName);
    } catch (e) {
        logger.info({ collectionName }, "Creating Qdrant collection...");
        await qdrant.createCollection(collectionName, {
            vectors: { size: 1024, distance: "Cosine" }
        });
    }

    for (const tableKey of tablesToIngest) {
        const mapping = ACTIVE_MAPPING[tableKey];
        if (!mapping) {
            logger.warn({ tableKey }, "Table key not found in mapping, skipping.");
            continue;
        }

        const checkpoint = state[mapping.table] || "1970-01-01 00:00:00";
        let query = `SELECT * FROM ${mapping.table} WHERE updated_at > ?`;
        const params: any[] = [checkpoint];

        if (tenantArg) {
            query += " AND tenant_id = ?";
            params.push(tenantArg);
        }

        query += " ORDER BY updated_at ASC";

        logger.info({ table: mapping.table, since: checkpoint }, "Fetching records...");
        const res = await db.query<any>({ text: query, values: params });
        logger.info({ table: mapping.table, newRecords: res.rowCount }, "Processing records...");

        let maxUpdatedAt = checkpoint;

        for (const row of res.rows) {
            const contextParts: string[] = [];
            let title = "";
            
            // Build the title and text for embedding
            for (const aiKey in mapping.rawConfig) {
                if (aiKey === "table") continue;
                const dbCol = mapping.rawConfig[aiKey];
                const cleaned = cleanValue(aiKey, row[dbCol]);
                if (cleaned) {
                    if (aiKey.toLowerCase().includes("title") || aiKey.toLowerCase().includes("name")) {
                        title = cleaned;
                    }
                    contextParts.push(`${aiKey}: ${cleaned}`);
                }
            }

            const text = contextParts.join(", ").substring(0, 2000);
            if (!title) title = text.substring(0, 100);

            try {
                const embedding = await generateEmbedding(text);
                const tenantId = row.tenant_id || tenantArg || "default";
                const recordId = String(row.id);
                const stableId = getStableId(mapping.table, recordId, tenantId);

                // Use strictly the structure requested by user
                const payload = {
                    tenant_id: tenantId,
                    table_name: mapping.table,
                    record_id: recordId,
                    patient_id: row.patient_id || null, // Common in many tables
                    title: title,
                    text: text,
                    updated_at: row.updated_at
                };

                const vectorData = env.QDRANT_VECTOR_NAME 
                    ? { [env.QDRANT_VECTOR_NAME]: embedding }
                    : embedding;

                await qdrant.upsert(collectionName, {
                    wait: true,
                    points: [{
                        id: stableId,
                        vector: vectorData as any,
                        payload: payload
                    }]
                });

                // Update maxUpdatedAt to track latest record
                if (row.updated_at > maxUpdatedAt) {
                    maxUpdatedAt = row.updated_at;
                }
                
                await new Promise(resolve => setTimeout(resolve, 100)); // Respect rate limits
            } catch (error: any) {
                logger.error({ id: row.id, table: mapping.table, error: error.message }, "Ingestion row failed");
            }
        }

        // Save progress for this table
        state[mapping.table] = maxUpdatedAt;
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
        logger.info({ table: mapping.table, lastSync: maxUpdatedAt }, "Checkpoint updated.");
    }

    await db.close();
    logger.info("Ingestion completed successfully.");
}

ingest().catch(err => {
    logger.error({ error: err.message }, "Ingestion process crashed");
    process.exit(1);
});
