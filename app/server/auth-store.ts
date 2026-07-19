import { getBindings } from "./cloudflare-env";

const AUTH_KV_KEY = "nextchat:auth";
const ATTEMPTS_KV_KEY = "nextchat:auth:attempts";
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

export interface AuthRecord {
  passwordHash: string;
  salt: string;
  jwtSecret: string;
  createdAt: number;
}

function getAuthKV() {
  const kv = getBindings().AUTH_KV;
  if (!kv) {
    throw new Error(
      "AUTH_KV binding not found. Login/setup only works when this app is deployed as a " +
        "Cloudflare Worker with the AUTH_KV KV namespace bound (see wrangler.jsonc).",
    );
  }
  return kv;
}

export async function getAuthRecord(): Promise<AuthRecord | null> {
  const raw = await getAuthKV().get(AUTH_KV_KEY);
  return raw ? (JSON.parse(raw) as AuthRecord) : null;
}

// Throws if a record already exists - setup must only ever succeed once.
export async function createAuthRecord(record: AuthRecord): Promise<void> {
  const kv = getAuthKV();
  const existing = await kv.get(AUTH_KV_KEY);
  if (existing) {
    throw new Error("already configured");
  }
  await kv.put(AUTH_KV_KEY, JSON.stringify(record));
}

interface AttemptsRecord {
  count: number;
  lockedUntil: number;
}

// Reduced PBKDF2 cost (see password.ts) makes online rate-limiting the
// primary defense against password guessing, so every login attempt - success
// or failure - goes through here before/after checking the password.
export async function checkLoginLockout(): Promise<{
  lockedUntil: number;
} | null> {
  const kv = getAuthKV();
  const raw = await kv.get(ATTEMPTS_KV_KEY);
  if (!raw) return null;
  const attempts = JSON.parse(raw) as AttemptsRecord;
  if (attempts.lockedUntil > Date.now()) {
    return { lockedUntil: attempts.lockedUntil };
  }
  return null;
}

export async function recordFailedLogin(): Promise<void> {
  const kv = getAuthKV();
  const raw = await kv.get(ATTEMPTS_KV_KEY);
  const attempts: AttemptsRecord = raw
    ? (JSON.parse(raw) as AttemptsRecord)
    : { count: 0, lockedUntil: 0 };

  attempts.count += 1;
  if (attempts.count >= MAX_FAILED_ATTEMPTS) {
    attempts.lockedUntil = Date.now() + LOCKOUT_MS;
    attempts.count = 0;
  }
  await kv.put(ATTEMPTS_KV_KEY, JSON.stringify(attempts));
}

export async function clearLoginAttempts(): Promise<void> {
  await getAuthKV().delete(ATTEMPTS_KV_KEY);
}
