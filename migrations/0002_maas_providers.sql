-- Multi-provider MaaS configuration. Each row is one MaaS account/gateway,
-- optionally exposing up to three protocol-compatible endpoints, all
-- authenticated with a single shared API key (one account, one key).
CREATE TABLE IF NOT EXISTS maas_providers (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  openai_base_url TEXT,
  anthropic_base_url TEXT,
  anthropic_version TEXT,
  gemini_base_url TEXT,
  extra_headers TEXT,
  api_key TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- One row per selectable model: which provider+protocol it's invoked
-- through, the literal model name sent to the API, and a user-facing
-- display name. The same underlying model can have more than one row (e.g.
-- a "stable" high-priority alias vs. the default one) since MaaS gateways
-- often expose those as distinct model names.
CREATE TABLE IF NOT EXISTS maas_models (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL REFERENCES maas_providers(id),
  protocol TEXT NOT NULL CHECK (protocol IN ('openai', 'anthropic', 'gemini')),
  model_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  vision INTEGER NOT NULL DEFAULT 0,
  tools INTEGER NOT NULL DEFAULT 0,
  context_length INTEGER,
  max_output_tokens INTEGER,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('discovered', 'manual')),
  available INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_maas_models_provider ON maas_models(provider_id);
