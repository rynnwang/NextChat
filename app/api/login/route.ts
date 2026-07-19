import { NextRequest, NextResponse } from "next/server";
import {
  checkLoginLockout,
  clearLoginAttempts,
  getAuthRecord,
  recordFailedLogin,
} from "@/app/server/auth-store";
import { verifyPassword } from "@/app/server/password";
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from "@/app/server/session";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const record = await getAuthRecord();
  if (!record) {
    return NextResponse.json(
      { error: true, msg: "not set up yet" },
      { status: 400 },
    );
  }

  const lockout = await checkLoginLockout();
  if (lockout) {
    return NextResponse.json(
      {
        error: true,
        msg: "too many failed attempts, try again later",
        lockedUntil: lockout.lockedUntil,
      },
      { status: 429 },
    );
  }

  const body = await req.json().catch(() => null);
  const password = typeof body?.password === "string" ? body.password : "";

  const ok = await verifyPassword(password, record.salt, record.passwordHash);
  if (!ok) {
    await recordFailedLogin();
    return NextResponse.json(
      { error: true, msg: "wrong password" },
      { status: 401 },
    );
  }

  await clearLoginAttempts();

  const token = await createSessionToken(record.jwtSecret);
  const res = NextResponse.json({ error: false });
  res.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions);
  return res;
}
