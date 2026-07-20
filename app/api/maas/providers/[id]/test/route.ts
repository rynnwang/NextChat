import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/app/server/require-session";
import { getProviderRaw } from "@/app/server/maas-store";
import { discoverModels, type MaasProtocol } from "@/app/server/maas-discovery";

export const dynamic = "force-dynamic";

// Connectivity check only - does not persist anything. Calls each enabled
// protocol's model-listing endpoint and reports per-protocol OK/error, so a
// gateway that only implements chat (not model-listing) can still be told
// apart from one that's genuinely unreachable/misconfigured.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const denied = await requireSession(req);
  if (denied) return denied;

  const row = await getProviderRaw(params.id);
  if (!row) {
    return NextResponse.json(
      { error: true, msg: "provider not found" },
      { status: 404 },
    );
  }

  const extraHeaders = row.extra_headers ? JSON.parse(row.extra_headers) : null;
  const endpoints: Array<[MaasProtocol, string | null]> = [
    ["openai", row.openai_base_url],
    ["anthropic", row.anthropic_base_url],
    ["gemini", row.gemini_base_url],
  ];

  const results = await Promise.all(
    endpoints
      .filter(([, baseUrl]) => !!baseUrl)
      .map(async ([protocol, baseUrl]) => {
        const result = await discoverModels(
          protocol,
          baseUrl as string,
          row.api_key ?? "",
          row.anthropic_version,
          extraHeaders,
        );
        return result.ok
          ? { protocol, ok: true, modelCount: result.modelNames.length }
          : { protocol, ok: false, error: result.error };
      }),
  );

  return NextResponse.json({ results });
}
