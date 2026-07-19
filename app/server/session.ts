import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE_NAME = "nextchat_session";
const SESSION_TTL = "30d";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function getSecretKey(jwtSecret: string): Uint8Array {
  return new TextEncoder().encode(jwtSecret);
}

export async function createSessionToken(jwtSecret: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(SESSION_TTL)
    .sign(getSecretKey(jwtSecret));
}

export async function verifySessionToken(
  token: string,
  jwtSecret: string,
): Promise<boolean> {
  try {
    await jwtVerify(token, getSecretKey(jwtSecret));
    return true;
  } catch {
    return false;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_MAX_AGE_SECONDS,
};
