import type { ProviderEndpoints } from "./maas-store";

// Returns undefined if the body has no "endpoints" key at all (meaning: leave
// unchanged, only relevant for partial updates), or a parsed object
// (possibly empty) otherwise.
export function parseEndpoints(body: unknown): ProviderEndpoints | undefined {
  const raw = (body as { endpoints?: unknown })?.endpoints;
  if (raw === undefined) return undefined;
  if (typeof raw !== "object" || raw === null) return {};

  const r = raw as Record<string, any>;
  const endpoints: ProviderEndpoints = {};

  if (r.openai?.baseUrl) {
    endpoints.openai = { baseUrl: String(r.openai.baseUrl) };
  }
  if (r.anthropic?.baseUrl) {
    endpoints.anthropic = {
      baseUrl: String(r.anthropic.baseUrl),
      version: r.anthropic.version ? String(r.anthropic.version) : undefined,
    };
  }
  if (r.gemini?.baseUrl) {
    endpoints.gemini = { baseUrl: String(r.gemini.baseUrl) };
  }

  return endpoints;
}
