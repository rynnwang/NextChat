import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/app/server/require-session";
import { getSyncMeta } from "@/app/server/chat-storage";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = await requireSession(req);
  if (denied) return denied;

  try {
    const meta = await getSyncMeta();
    return NextResponse.json(meta ?? { updatedAt: null, sizeBytes: null });
  } catch (e) {
    console.error("[Sync] failed to read meta", e);
    return NextResponse.json(
      { error: true, msg: (e as Error).message },
      { status: 500 },
    );
  }
}
