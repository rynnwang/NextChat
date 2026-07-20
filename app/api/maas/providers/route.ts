import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/app/server/require-session";
import {
  createProvider,
  listProviders,
  type MaasProviderInput,
} from "@/app/server/maas-store";
import { parseEndpoints } from "@/app/server/maas-validate";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = await requireSession(req);
  if (denied) return denied;

  try {
    return NextResponse.json(await listProviders());
  } catch (e) {
    console.error("[MaaS] failed to list providers", e);
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
  const label = (body as { label?: unknown })?.label;
  if (typeof label !== "string" || label.trim().length === 0) {
    return NextResponse.json(
      { error: true, msg: "label is required" },
      { status: 400 },
    );
  }

  const endpoints = parseEndpoints(body);
  if (!endpoints || Object.keys(endpoints).length === 0) {
    return NextResponse.json(
      {
        error: true,
        msg: "at least one endpoint (openai/anthropic/gemini) is required",
      },
      { status: 400 },
    );
  }

  const input: MaasProviderInput = {
    label: label.trim(),
    enabled: (body as { enabled?: unknown })?.enabled !== false,
    endpoints,
    extraHeaders: (body as { extraHeaders?: Record<string, string> })
      ?.extraHeaders,
    apiKey: (body as { apiKey?: string })?.apiKey ?? null,
  };

  try {
    return NextResponse.json(await createProvider(input), { status: 201 });
  } catch (e) {
    console.error("[MaaS] failed to create provider", e);
    return NextResponse.json(
      { error: true, msg: (e as Error).message },
      { status: 500 },
    );
  }
}
