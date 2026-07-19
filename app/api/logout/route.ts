import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/app/server/session";

export const dynamic = "force-dynamic";

export async function POST() {
  const res = NextResponse.json({ error: false });
  res.cookies.delete(SESSION_COOKIE_NAME);
  return res;
}
