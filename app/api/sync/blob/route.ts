import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/app/server/require-session";
import { getSyncBlob, putSyncBlob } from "@/app/server/chat-storage";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = await requireSession(req);
  if (denied) return denied;

  try {
    const blob = await getSyncBlob();
    if (blob === null) {
      return NextResponse.json({ error: true, msg: "not found" }, {
        status: 404,
      });
    }
    return new NextResponse(blob, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[Sync] failed to read blob", e);
    return NextResponse.json(
      { error: true, msg: (e as Error).message },
      { status: 500 },
    );
  }
}

export async function PUT(req: NextRequest) {
  const denied = await requireSession(req);
  if (denied) return denied;

  try {
    const body = await req.text();
    const meta = await putSyncBlob(body);
    return NextResponse.json(meta);
  } catch (e) {
    console.error("[Sync] failed to write blob", e);
    return NextResponse.json(
      { error: true, msg: (e as Error).message },
      { status: 500 },
    );
  }
}
