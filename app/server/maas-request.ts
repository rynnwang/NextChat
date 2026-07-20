import { NextRequest, NextResponse } from "next/server";
import { getProviderRaw } from "./maas-store";
import type { MaasProtocol } from "./maas-discovery";

export const MAAS_PROVIDER_HEADER = "x-maas-provider-id";

export interface ResolvedMaasEndpoint {
  baseUrl: string;
  apiKey: string;
  anthropicVersion?: string;
  extraHeaders?: Record<string, string>;
}

// Every chat/model-list request must say which configured MaaS provider it's
// for (there's no longer a single implicit gateway) - the client sends this
// via the X-Maas-Provider-Id header, set from the selected model's provider.
export async function resolveMaasEndpoint(
  req: NextRequest,
  protocol: MaasProtocol,
): Promise<ResolvedMaasEndpoint | NextResponse> {
  const providerId = req.headers.get(MAAS_PROVIDER_HEADER);
  if (!providerId) {
    return NextResponse.json(
      { error: true, msg: `missing ${MAAS_PROVIDER_HEADER} header` },
      { status: 400 },
    );
  }

  const row = await getProviderRaw(providerId);
  if (!row) {
    return NextResponse.json(
      { error: true, msg: "MaaS provider not found" },
      { status: 404 },
    );
  }

  const baseUrl =
    protocol === "openai"
      ? row.openai_base_url
      : protocol === "anthropic"
      ? row.anthropic_base_url
      : row.gemini_base_url;
  if (!baseUrl) {
    return NextResponse.json(
      {
        error: true,
        msg: `${protocol} endpoint is not configured on provider "${row.label}"`,
      },
      { status: 400 },
    );
  }

  if (!row.api_key) {
    return NextResponse.json(
      {
        error: true,
        msg: `provider "${row.label}" has no API key configured`,
      },
      { status: 400 },
    );
  }

  return {
    baseUrl,
    apiKey: row.api_key,
    anthropicVersion: row.anthropic_version ?? undefined,
    extraHeaders: row.extra_headers ? JSON.parse(row.extra_headers) : undefined,
  };
}

export function isErrorResponse(
  x: ResolvedMaasEndpoint | NextResponse,
): x is NextResponse {
  return x instanceof NextResponse;
}
