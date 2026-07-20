import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/app/server/require-session";
import {
  deleteProvider,
  updateProvider,
  type MaasProviderInput,
} from "@/app/server/maas-store";
import { parseEndpoints } from "@/app/server/maas-validate";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const denied = await requireSession(req);
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json(
      { error: true, msg: "invalid request body" },
      { status: 400 },
    );
  }

  const label = (body as { label?: unknown }).label;
  const enabled = (body as { enabled?: unknown }).enabled;
  const apiKey = (body as { apiKey?: string | null }).apiKey;

  const input: Partial<MaasProviderInput> = {
    ...(typeof label === "string" ? { label: label.trim() } : {}),
    ...(typeof enabled === "boolean" ? { enabled } : {}),
    ...(apiKey !== undefined ? { apiKey } : {}),
    endpoints: parseEndpoints(body) as any,
    extraHeaders: (body as { extraHeaders?: Record<string, string> })
      .extraHeaders,
  };
  // parseEndpoints returns undefined when the body omitted "endpoints"
  // entirely; drop the key so updateProvider() knows to leave it unchanged.
  if (input.endpoints === undefined) delete input.endpoints;

  try {
    const updated = await updateProvider(params.id, input);
    if (!updated) {
      return NextResponse.json(
        { error: true, msg: "provider not found" },
        { status: 404 },
      );
    }
    return NextResponse.json(updated);
  } catch (e) {
    console.error("[MaaS] failed to update provider", e);
    return NextResponse.json(
      { error: true, msg: (e as Error).message },
      { status: 500 },
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const denied = await requireSession(req);
  if (denied) return denied;

  try {
    const ok = await deleteProvider(params.id);
    if (!ok) {
      return NextResponse.json(
        { error: true, msg: "provider not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[MaaS] failed to delete provider", e);
    return NextResponse.json(
      { error: true, msg: (e as Error).message },
      { status: 500 },
    );
  }
}
