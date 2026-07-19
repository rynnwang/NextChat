import { NextRequest, NextResponse } from "next/server";
import { createAuthRecord, getAuthRecord } from "@/app/server/auth-store";
import { hashPassword, generateSecret } from "@/app/server/password";
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from "@/app/server/session";

// Must never be statically evaluated at build time - getAuthRecord() needs a
// real Cloudflare request context (KV binding) that only exists per-request.
export const dynamic = "force-dynamic";

const MIN_PASSWORD_LENGTH = 8;

export async function GET() {
  const record = await getAuthRecord();
  return NextResponse.json({ configured: !!record });
}

export async function POST(req: NextRequest) {
  const existing = await getAuthRecord();
  if (existing) {
    return NextResponse.json(
      { error: true, msg: "setup has already been completed" },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => null);
  const password = typeof body?.password === "string" ? body.password : "";

  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      {
        error: true,
        msg: `password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      },
      { status: 400 },
    );
  }

  const { salt, hash } = await hashPassword(password);
  const jwtSecret = generateSecret();

  try {
    await createAuthRecord({
      passwordHash: hash,
      salt,
      jwtSecret,
      createdAt: Date.now(),
    });
  } catch {
    // Someone else's concurrent setup request won the race.
    return NextResponse.json(
      { error: true, msg: "setup has already been completed" },
      { status: 403 },
    );
  }

  const token = await createSessionToken(jwtSecret);
  const res = NextResponse.json({ error: false });
  res.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions);
  return res;
}
