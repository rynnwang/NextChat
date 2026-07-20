export type MaasProtocol = "openai" | "anthropic" | "gemini";

const LIST_MODEL_PATH: Record<MaasProtocol, string> = {
  openai: "v1/models",
  anthropic: "v1/models",
  gemini: "v1beta/models",
};

const DEFAULT_ANTHROPIC_VERSION = "2023-06-01";

export type DiscoverResult =
  | { ok: true; modelNames: string[] }
  | { ok: false; error: string };

function buildUrl(baseUrl: string, protocol: MaasProtocol): string {
  let url = baseUrl.trim();
  if (!url.startsWith("http")) url = `https://${url}`;
  if (url.endsWith("/")) url = url.slice(0, -1);
  return `${url}/${LIST_MODEL_PATH[protocol]}`;
}

function buildHeaders(
  protocol: MaasProtocol,
  apiKey: string,
  anthropicVersion: string | null,
  extraHeaders: Record<string, string> | null,
): Record<string, string> {
  const headers: Record<string, string> = { ...(extraHeaders ?? {}) };
  if (protocol === "anthropic") {
    headers["x-api-key"] = apiKey;
    headers["anthropic-version"] =
      anthropicVersion || DEFAULT_ANTHROPIC_VERSION;
  } else if (protocol === "gemini") {
    headers["x-goog-api-key"] = apiKey;
  } else {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }
  return headers;
}

function parseModelNames(protocol: MaasProtocol, body: unknown): string[] {
  if (protocol === "gemini") {
    const models = (body as { models?: Array<{ name?: string }> })?.models;
    return (models ?? [])
      .map((m) => m.name?.replace(/^models\//, ""))
      .filter((id): id is string => !!id);
  }
  const data = (body as { data?: Array<{ id: string }> })?.data;
  return (data ?? []).map((m) => m.id).filter((id): id is string => !!id);
}

// Directly queries a MaaS gateway's own model-listing endpoint (not through
// this app's /api/{provider} proxy routes - this runs server-side already,
// using the provider's real stored credentials).
export async function discoverModels(
  protocol: MaasProtocol,
  baseUrl: string,
  apiKey: string,
  anthropicVersion: string | null,
  extraHeaders: Record<string, string> | null,
): Promise<DiscoverResult> {
  if (!apiKey) {
    return { ok: false, error: "no API key configured for this provider" };
  }

  try {
    const res = await fetch(buildUrl(baseUrl, protocol), {
      method: "GET",
      headers: buildHeaders(protocol, apiKey, anthropicVersion, extraHeaders),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        ok: false,
        error: `${res.status} ${res.statusText}${
          text ? `: ${text.slice(0, 200)}` : ""
        }`,
      };
    }

    const modelNames = parseModelNames(protocol, await res.json());
    if (modelNames.length === 0) {
      return { ok: false, error: "gateway returned an empty model list" };
    }
    return { ok: true, modelNames };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
