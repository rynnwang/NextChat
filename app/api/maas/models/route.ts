import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/app/server/require-session";
import {
  createModel,
  listAllModels,
  type MaasModelInput,
} from "@/app/server/maas-store";
import type { MaasProtocol } from "@/app/server/maas-discovery";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = await requireSession(req);
  if (denied) return denied;

  try {
    return NextResponse.json(await listAllModels());
  } catch (e) {
    console.error("[MaaS] failed to list models", e);
    return NextResponse.json(
      { error: true, msg: (e as Error).message },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const denied = await requireSession(req);
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  const providerId = (body as { providerId?: unknown })?.providerId;
  const protocol = (body as { protocol?: unknown })?.protocol;
  const modelName = (body as { modelName?: unknown })?.modelName;
  const displayName = (body as { displayName?: unknown })?.displayName;

  if (
    typeof providerId !== "string" ||
    !["openai", "anthropic", "gemini"].includes(protocol as string) ||
    typeof modelName !== "string" ||
    modelName.trim().length === 0
  ) {
    return NextResponse.json(
      {
        error: true,
        msg: "providerId, protocol (openai/anthropic/gemini), and modelName are required",
      },
      { status: 400 },
    );
  }

  const input: MaasModelInput = {
    providerId,
    protocol: protocol as MaasProtocol,
    modelName: modelName.trim(),
    displayName:
      typeof displayName === "string" && displayName.trim()
        ? displayName.trim()
        : modelName.trim(),
    vision: !!(body as { vision?: unknown })?.vision,
    tools: !!(body as { tools?: unknown })?.tools,
    contextLength:
      (body as { contextLength?: number | null })?.contextLength ?? null,
    maxOutputTokens:
      (body as { maxOutputTokens?: number | null })?.maxOutputTokens ?? null,
  };

  try {
    return NextResponse.json(await createModel(input), { status: 201 });
  } catch (e) {
    console.error("[MaaS] failed to create model", e);
    return NextResponse.json(
      { error: true, msg: (e as Error).message },
      { status: 500 },
    );
  }
}
