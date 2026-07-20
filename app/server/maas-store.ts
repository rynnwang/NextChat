import { getBindings } from "./cloudflare-env";
import type { MaasProtocol } from "./maas-discovery";

function getDB() {
  const db = getBindings().CHAT_DB;
  if (!db) {
    throw new Error(
      "CHAT_DB binding not found. MaaS provider management only works when " +
        "this app is deployed as a Cloudflare Worker with the CHAT_DB D1 " +
        "database bound (see wrangler.jsonc).",
    );
  }
  return db;
}

function maskKey(key: string | null): string | undefined {
  if (!key) return undefined;
  if (key.length <= 8) return "••••";
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

interface MaasProviderRow {
  id: string;
  label: string;
  enabled: number;
  openai_base_url: string | null;
  anthropic_base_url: string | null;
  anthropic_version: string | null;
  gemini_base_url: string | null;
  extra_headers: string | null;
  api_key: string | null;
  created_at: number;
  updated_at: number;
}

export interface ProviderEndpoints {
  openai?: { baseUrl: string };
  anthropic?: { baseUrl: string; version?: string };
  gemini?: { baseUrl: string };
}

export interface MaasProvider {
  id: string;
  label: string;
  enabled: boolean;
  endpoints: ProviderEndpoints;
  extraHeaders?: Record<string, string>;
  hasApiKey: boolean;
  apiKeyMasked?: string;
  createdAt: number;
  updatedAt: number;
}

export interface MaasProviderInput {
  label: string;
  enabled?: boolean;
  endpoints: ProviderEndpoints;
  extraHeaders?: Record<string, string>;
  // undefined = leave unchanged (update only), null = clear stored key,
  // string = set/replace stored key.
  apiKey?: string | null;
}

function rowToProvider(row: MaasProviderRow): MaasProvider {
  const endpoints: ProviderEndpoints = {};
  if (row.openai_base_url) endpoints.openai = { baseUrl: row.openai_base_url };
  if (row.anthropic_base_url) {
    endpoints.anthropic = {
      baseUrl: row.anthropic_base_url,
      version: row.anthropic_version ?? undefined,
    };
  }
  if (row.gemini_base_url) endpoints.gemini = { baseUrl: row.gemini_base_url };

  return {
    id: row.id,
    label: row.label,
    enabled: !!row.enabled,
    endpoints,
    extraHeaders: row.extra_headers ? JSON.parse(row.extra_headers) : undefined,
    hasApiKey: !!row.api_key,
    apiKeyMasked: maskKey(row.api_key),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listProviders(): Promise<MaasProvider[]> {
  const { results } = await getDB()
    .prepare("SELECT * FROM maas_providers ORDER BY created_at ASC")
    .all<MaasProviderRow>();
  return (results ?? []).map(rowToProvider);
}

// Internal-only: includes the real API key, used for testing/discovery/proxying.
export async function getProviderRaw(
  id: string,
): Promise<MaasProviderRow | null> {
  const row = await getDB()
    .prepare("SELECT * FROM maas_providers WHERE id = ?")
    .bind(id)
    .first<MaasProviderRow>();
  return row ?? null;
}

export async function getProvider(id: string): Promise<MaasProvider | null> {
  const row = await getProviderRaw(id);
  return row ? rowToProvider(row) : null;
}

export async function createProvider(
  input: MaasProviderInput,
): Promise<MaasProvider> {
  const id = crypto.randomUUID();
  const now = Date.now();
  await getDB()
    .prepare(
      `INSERT INTO maas_providers
        (id, label, enabled, openai_base_url, anthropic_base_url, anthropic_version, gemini_base_url, extra_headers, api_key, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      input.label,
      input.enabled === false ? 0 : 1,
      input.endpoints.openai?.baseUrl ?? null,
      input.endpoints.anthropic?.baseUrl ?? null,
      input.endpoints.anthropic?.version ?? null,
      input.endpoints.gemini?.baseUrl ?? null,
      input.extraHeaders ? JSON.stringify(input.extraHeaders) : null,
      input.apiKey ?? null,
      now,
      now,
    )
    .run();

  return (await getProvider(id))!;
}

export async function updateProvider(
  id: string,
  input: Partial<MaasProviderInput>,
): Promise<MaasProvider | null> {
  const existing = await getProviderRaw(id);
  if (!existing) return null;

  const label = input.label ?? existing.label;
  const enabled =
    input.enabled === undefined ? existing.enabled : input.enabled ? 1 : 0;
  const endpoints = input.endpoints;
  const openaiBaseUrl =
    endpoints !== undefined
      ? endpoints.openai?.baseUrl ?? null
      : existing.openai_base_url;
  const anthropicBaseUrl =
    endpoints !== undefined
      ? endpoints.anthropic?.baseUrl ?? null
      : existing.anthropic_base_url;
  const anthropicVersion =
    endpoints !== undefined
      ? endpoints.anthropic?.version ?? null
      : existing.anthropic_version;
  const geminiBaseUrl =
    endpoints !== undefined
      ? endpoints.gemini?.baseUrl ?? null
      : existing.gemini_base_url;
  const extraHeaders =
    input.extraHeaders !== undefined
      ? input.extraHeaders
        ? JSON.stringify(input.extraHeaders)
        : null
      : existing.extra_headers;
  // apiKey: undefined = leave unchanged, null = clear, string = replace.
  const apiKey = input.apiKey === undefined ? existing.api_key : input.apiKey;

  await getDB()
    .prepare(
      `UPDATE maas_providers SET
        label = ?, enabled = ?, openai_base_url = ?, anthropic_base_url = ?,
        anthropic_version = ?, gemini_base_url = ?, extra_headers = ?, api_key = ?,
        updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      label,
      enabled,
      openaiBaseUrl,
      anthropicBaseUrl,
      anthropicVersion,
      geminiBaseUrl,
      extraHeaders,
      apiKey,
      Date.now(),
      id,
    )
    .run();

  return await getProvider(id);
}

export async function deleteProvider(id: string): Promise<boolean> {
  const db = getDB();
  const existing = await db
    .prepare("SELECT id FROM maas_providers WHERE id = ?")
    .bind(id)
    .first();
  if (!existing) return false;

  await db.batch([
    db.prepare("DELETE FROM maas_models WHERE provider_id = ?").bind(id),
    db.prepare("DELETE FROM maas_providers WHERE id = ?").bind(id),
  ]);
  return true;
}

export async function revealApiKey(id: string): Promise<string | null> {
  const row = await getProviderRaw(id);
  return row?.api_key ?? null;
}

interface MaasModelRow {
  id: string;
  provider_id: string;
  protocol: MaasProtocol;
  model_name: string;
  display_name: string;
  vision: number;
  tools: number;
  context_length: number | null;
  max_output_tokens: number | null;
  source: "discovered" | "manual";
  available: number;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

export interface MaasModel {
  id: string;
  providerId: string;
  protocol: MaasProtocol;
  modelName: string;
  displayName: string;
  vision: boolean;
  tools: boolean;
  contextLength: number | null;
  maxOutputTokens: number | null;
  source: "discovered" | "manual";
  available: boolean;
  sortOrder: number;
}

export interface MaasModelWithProvider extends MaasModel {
  providerLabel: string;
  providerEnabled: boolean;
}

function rowToModel(row: MaasModelRow): MaasModel {
  return {
    id: row.id,
    providerId: row.provider_id,
    protocol: row.protocol,
    modelName: row.model_name,
    displayName: row.display_name,
    vision: !!row.vision,
    tools: !!row.tools,
    contextLength: row.context_length,
    maxOutputTokens: row.max_output_tokens,
    source: row.source,
    available: !!row.available,
    sortOrder: row.sort_order,
  };
}

export async function listAllModels(): Promise<MaasModelWithProvider[]> {
  const { results } = await getDB()
    .prepare(
      `SELECT m.*, p.label as provider_label, p.enabled as provider_enabled
       FROM maas_models m JOIN maas_providers p ON p.id = m.provider_id
       ORDER BY p.created_at ASC, m.sort_order ASC`,
    )
    .all<MaasModelRow & { provider_label: string; provider_enabled: number }>();

  return (results ?? []).map((row) => ({
    ...rowToModel(row),
    providerLabel: row.provider_label,
    providerEnabled: !!row.provider_enabled,
  }));
}

export async function listModelsForProvider(
  providerId: string,
): Promise<MaasModel[]> {
  const { results } = await getDB()
    .prepare(
      "SELECT * FROM maas_models WHERE provider_id = ? ORDER BY sort_order ASC",
    )
    .bind(providerId)
    .all<MaasModelRow>();
  return (results ?? []).map(rowToModel);
}

export interface MaasModelInput {
  providerId: string;
  protocol: MaasProtocol;
  modelName: string;
  displayName: string;
  vision?: boolean;
  tools?: boolean;
  contextLength?: number | null;
  maxOutputTokens?: number | null;
}

export async function createModel(input: MaasModelInput): Promise<MaasModel> {
  const id = crypto.randomUUID();
  const now = Date.now();
  await getDB()
    .prepare(
      `INSERT INTO maas_models
        (id, provider_id, protocol, model_name, display_name, vision, tools,
         context_length, max_output_tokens, source, available, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', 1, 0, ?, ?)`,
    )
    .bind(
      id,
      input.providerId,
      input.protocol,
      input.modelName,
      input.displayName,
      input.vision ? 1 : 0,
      input.tools ? 1 : 0,
      input.contextLength ?? null,
      input.maxOutputTokens ?? null,
      now,
      now,
    )
    .run();

  return (await getDB()
    .prepare("SELECT * FROM maas_models WHERE id = ?")
    .bind(id)
    .first<MaasModelRow>()
    .then((row) => rowToModel(row!)))!;
}

export interface MaasModelUpdate {
  displayName?: string;
  vision?: boolean;
  tools?: boolean;
  contextLength?: number | null;
  maxOutputTokens?: number | null;
  available?: boolean;
}

export async function updateModel(
  id: string,
  input: MaasModelUpdate,
): Promise<MaasModel | null> {
  const db = getDB();
  const existing = await db
    .prepare("SELECT * FROM maas_models WHERE id = ?")
    .bind(id)
    .first<MaasModelRow>();
  if (!existing) return null;

  const displayName = input.displayName ?? existing.display_name;
  const vision =
    input.vision === undefined ? existing.vision : input.vision ? 1 : 0;
  const tools =
    input.tools === undefined ? existing.tools : input.tools ? 1 : 0;
  const contextLength =
    input.contextLength === undefined
      ? existing.context_length
      : input.contextLength;
  const maxOutputTokens =
    input.maxOutputTokens === undefined
      ? existing.max_output_tokens
      : input.maxOutputTokens;
  const available =
    input.available === undefined
      ? existing.available
      : input.available
      ? 1
      : 0;

  await db
    .prepare(
      `UPDATE maas_models SET display_name = ?, vision = ?, tools = ?,
        context_length = ?, max_output_tokens = ?, available = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      displayName,
      vision,
      tools,
      contextLength,
      maxOutputTokens,
      available,
      Date.now(),
      id,
    )
    .run();

  const row = await db
    .prepare("SELECT * FROM maas_models WHERE id = ?")
    .bind(id)
    .first<MaasModelRow>();
  return row ? rowToModel(row) : null;
}

export async function deleteModel(id: string): Promise<boolean> {
  const res = await getDB()
    .prepare("DELETE FROM maas_models WHERE id = ?")
    .bind(id)
    .run();
  return (res.meta.changes ?? 0) > 0;
}

// Upserts freshly-discovered model names for one provider+protocol.
// Never touches manually-added rows; marks previously-discovered rows that
// no longer appear as unavailable rather than deleting them (so a model
// that temporarily drops out of the gateway's list doesn't lose any
// display-name/capability edits the user made).
export async function upsertDiscoveredModels(
  providerId: string,
  protocol: MaasProtocol,
  modelNames: string[],
): Promise<MaasModel[]> {
  const db = getDB();
  const existingRows =
    (
      await db
        .prepare(
          "SELECT * FROM maas_models WHERE provider_id = ? AND protocol = ? AND source = 'discovered'",
        )
        .bind(providerId, protocol)
        .all<MaasModelRow>()
    ).results ?? [];

  const existingByName = new Map(existingRows.map((r) => [r.model_name, r]));
  const now = Date.now();
  const statements = [];

  let sortOrder = existingRows.length
    ? Math.max(...existingRows.map((r) => r.sort_order)) + 1
    : 0;

  for (const name of modelNames) {
    const existing = existingByName.get(name);
    if (existing) {
      if (!existing.available) {
        statements.push(
          db
            .prepare(
              "UPDATE maas_models SET available = 1, updated_at = ? WHERE id = ?",
            )
            .bind(now, existing.id),
        );
      }
    } else {
      statements.push(
        db
          .prepare(
            `INSERT INTO maas_models
              (id, provider_id, protocol, model_name, display_name, vision, tools,
               context_length, max_output_tokens, source, available, sort_order, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, 0, 0, NULL, NULL, 'discovered', 1, ?, ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            providerId,
            protocol,
            name,
            name,
            sortOrder++,
            now,
            now,
          ),
      );
    }
  }

  const namesSet = new Set(modelNames);
  for (const row of existingRows) {
    if (!namesSet.has(row.model_name) && row.available) {
      statements.push(
        db
          .prepare(
            "UPDATE maas_models SET available = 0, updated_at = ? WHERE id = ?",
          )
          .bind(now, row.id),
      );
    }
  }

  if (statements.length > 0) {
    await db.batch(statements);
  }

  return listModelsForProvider(providerId);
}
