import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/app/server/require-session";
import {
  getProviderRaw,
  upsertDiscoveredModels,
} from "@/app/server/maas-store";
import { discoverModels, type MaasProtocol } from "@/app/server/maas-discovery";

export const dynamic = "force-dynamic";

function baseUrlFor(
  protocol: MaasProtocol,
  row: {
    openai_base_url: string | null;
    anthropic_base_url: string | null;
    gemini_base_url: string | null;
  },
): string | null {
  switch (protocol) {
    case "openai":
      return row.openai_base_url;
    case "anthropic":
      return row.anthropic_base_url;
    case "gemini":
      return row.gemini_base_url;
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const denied = await requireSession(req);
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  const protocol = (body as { protocol?: string })?.protocol as MaasProtocol;
  if (!protocol || !["openai", "anthropic", "gemini"].includes(protocol)) {
    return NextResponse.json(
      { error: true, msg: "protocol must be one of openai/anthropic/gemini" },
      { status: 400 },
    );
  }

  const row = await getProviderRaw(params.id);
  if (!row) {
    return NextResponse.json(
      { error: true, msg: "provider not found" },
      { status: 404 },
    );
  }

  const baseUrl = baseUrlFor(protocol, row);
  if (!baseUrl) {
    return NextResponse.json(
      {
        error: true,
        msg: `${protocol} endpoint is not configured on this provider`,
      },
      { status: 400 },
    );
  }

  const extraHeaders = row.extra_headers ? JSON.parse(row.extra_headers) : null;
  const result = await discoverModels(
    protocol,
    baseUrl,
    row.api_key ?? "",
    row.anthropic_version,
    extraHeaders,
  );

  if (!result.ok) {
    return NextResponse.json(
      { error: true, msg: result.error },
      { status: 502 },
    );
  }

  const models = await upsertDiscoveredModels(
    params.id,
    protocol,
    result.modelNames,
  );
  return NextResponse.json({ models });
}
