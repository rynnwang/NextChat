import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/app/server/require-session";
import { revealApiKey } from "@/app/server/maas-store";

export const dynamic = "force-dynamic";

// Lazily returns the real, unmasked API key - only ever called on demand
// (e.g. a "show stored key" click), never included in the provider list/get
// responses.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const denied = await requireSession(req);
  if (denied) return denied;

  const apiKey = await revealApiKey(params.id);
  if (apiKey === null) {
    return NextResponse.json(
      { error: true, msg: "provider not found or has no stored key" },
      { status: 404 },
    );
  }
  return NextResponse.json({ apiKey });
}
