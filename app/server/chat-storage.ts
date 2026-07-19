import { getBindings } from "./cloudflare-env";

const BLOB_KEY = "app-state.json";

export interface SyncMeta {
  updatedAt: number;
  sizeBytes: number;
}

function getDB() {
  const db = getBindings().CHAT_DB;
  if (!db) {
    throw new Error(
      "CHAT_DB binding not found. Chat-history sync only works when this app is deployed as a " +
        "Cloudflare Worker with the CHAT_DB D1 database bound (see wrangler.jsonc).",
    );
  }
  return db;
}

function getBucket() {
  const bucket = getBindings().CHAT_FILES;
  if (!bucket) {
    throw new Error(
      "CHAT_FILES binding not found. Chat-history sync only works when this app is deployed as " +
        "a Cloudflare Worker with the CHAT_FILES R2 bucket bound (see wrangler.jsonc).",
    );
  }
  return bucket;
}

// D1 is queried for a cheap "has anything changed" check before pulling the
// (potentially large) blob out of R2.
export async function getSyncMeta(): Promise<SyncMeta | null> {
  const row = await getDB()
    .prepare("SELECT updated_at, size_bytes FROM sync_state WHERE id = 1")
    .first<{ updated_at: number; size_bytes: number }>();

  if (!row) return null;
  return { updatedAt: row.updated_at, sizeBytes: row.size_bytes };
}

export async function getSyncBlob(): Promise<string | null> {
  const obj = await getBucket().get(BLOB_KEY);
  if (!obj) return null;
  return await obj.text();
}

export async function putSyncBlob(data: string): Promise<SyncMeta> {
  const bucket = getBucket();
  const db = getDB();

  await bucket.put(BLOB_KEY, data, {
    httpMetadata: { contentType: "application/json" },
  });

  const updatedAt = Date.now();
  const sizeBytes = new TextEncoder().encode(data).length;

  await db
    .prepare(
      `INSERT INTO sync_state (id, updated_at, size_bytes) VALUES (1, ?, ?)
       ON CONFLICT (id) DO UPDATE SET updated_at = excluded.updated_at, size_bytes = excluded.size_bytes`,
    )
    .bind(updatedAt, sizeBytes)
    .run();

  return { updatedAt, sizeBytes };
}
