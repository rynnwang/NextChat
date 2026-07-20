import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/app/server/require-session";
import {
  deleteModel,
  updateModel,
  type MaasModelUpdate,
} from "@/app/server/maas-store";

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

  const input: MaasModelUpdate = {
    displayName: (body as { displayName?: string }).displayName,
    vision: (body as { vision?: boolean }).vision,
    tools: (body as { tools?: boolean }).tools,
    contextLength: (body as { contextLength?: number | null }).contextLength,
    maxOutputTokens: (body as { maxOutputTokens?: number | null })
      .maxOutputTokens,
    available: (body as { available?: boolean }).available,
  };

  try {
    const updated = await updateModel(params.id, input);
    if (!updated) {
      return NextResponse.json(
        { error: true, msg: "model not found" },
        { status: 404 },
      );
    }
    return NextResponse.json(updated);
  } catch (e) {
    console.error("[MaaS] failed to update model", e);
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
    const ok = await deleteModel(params.id);
    if (!ok) {
      return NextResponse.json(
        { error: true, msg: "model not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[MaaS] failed to delete model", e);
    return NextResponse.json(
      { error: true, msg: (e as Error).message },
      { status: 500 },
    );
  }
}
