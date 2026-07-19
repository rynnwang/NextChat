import { NextRequest, NextResponse } from "next/server";
import { getAuthRecord } from "./auth-store";
import { verifySessionToken, SESSION_COOKIE_NAME } from "./session";

// Returns a 401 response if the request isn't a valid, logged-in session, or
// null if the caller should proceed. Used by every route that talks to the
// MaaS gateway or the D1/R2-backed chat storage.
export async function requireSession(
  req: NextRequest,
): Promise<NextResponse | null> {
  const record = await getAuthRecord();
  if (!record) {
    return NextResponse.json(
      { error: true, msg: "not set up yet" },
      { status: 401 },
    );
  }

  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const ok = !!token && (await verifySessionToken(token, record.jwtSecret));
  if (!ok) {
    return NextResponse.json(
      { error: true, msg: "unauthorized" },
      { status: 401 },
    );
  }

  return null;
}
