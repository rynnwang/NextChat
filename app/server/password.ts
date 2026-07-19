// PBKDF2 via Web Crypto - available natively in both the Workers runtime and
// Node.js, so this needs no extra native dependency (e.g. bcrypt) that would
// be awkward to run inside a Worker.
//
// The iteration count is intentionally far below OWASP's ~210,000
// recommendation: the Workers Free plan caps a single request at 10ms of CPU
// time (measured ~15ms just for the hash at 100,000 iterations locally, with
// no budget left for the rest of the request), so a login attempt at OWASP
// strength would simply fail on the free tier. This is a single admin
// password gate, not a multi-tenant credential store, so the practical
// mitigation for the reduced KDF cost is login rate-limiting (see
// auth-store.ts) plus a genuinely long passphrase, rather than iteration
// count alone.
const PBKDF2_ITERATIONS = 10_000;
const HASH_ALGORITHM = "SHA-256";
const KEY_LENGTH_BITS = 256;
const SALT_LENGTH_BYTES = 16;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveBits(
  password: string,
  salt: Uint8Array,
): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: HASH_ALGORITHM,
    },
    keyMaterial,
    KEY_LENGTH_BITS,
  );
  return new Uint8Array(bits);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export async function hashPassword(
  password: string,
): Promise<{ salt: string; hash: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH_BYTES));
  const hash = await deriveBits(password, salt);
  return { salt: toBase64(salt), hash: toBase64(hash) };
}

export async function verifyPassword(
  password: string,
  salt: string,
  expectedHash: string,
): Promise<boolean> {
  const hash = await deriveBits(password, fromBase64(salt));
  return timingSafeEqual(toBase64(hash), expectedHash);
}

export function generateSecret(): string {
  return toBase64(crypto.getRandomValues(new Uint8Array(32)));
}
