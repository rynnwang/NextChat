import { NextRequest, NextResponse } from "next/server";
import { getAuthRecord } from "@/app/server/auth-store";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/app/server/session";

// Must never be statically evaluated at build time - getAuthRecord() needs a
// real Cloudflare request context (KV binding) that only exists per-request.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const record = await getAuthRecord();
  if (!record) {
    return NextResponse.json({ configured: false, authenticated: false });
  }

  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const authenticated =
    !!token && (await verifySessionToken(token, record.jwtSecret));

  return NextResponse.json({ configured: true, authenticated });
}
