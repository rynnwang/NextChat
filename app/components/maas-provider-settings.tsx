"use client";
import { useEffect, useState } from "react";
import {
  List,
  ListItem,
  Modal,
  PasswordInput,
  showConfirm,
  showToast,
} from "./ui-lib";
import { IconButton } from "./button";
import AddIcon from "../icons/add.svg";
import EditIcon from "../icons/edit.svg";
import DeleteIcon from "../icons/delete.svg";
import ResetIcon from "../icons/reload.svg";
import ConfirmIcon from "../icons/confirm.svg";
import CancelIcon from "../icons/cancel.svg";
import EyeIcon from "../icons/eye.svg";

type Protocol = "openai" | "anthropic" | "gemini";

interface ProviderEndpoints {
  openai?: { baseUrl: string };
  anthropic?: { baseUrl: string; version?: string };
  gemini?: { baseUrl: string };
}

interface Provider {
  id: string;
  label: string;
  enabled: boolean;
  endpoints: ProviderEndpoints;
  hasApiKey: boolean;
  apiKeyMasked?: string;
}

interface ModelRow {
  id: string;
  providerId: string;
  protocol: Protocol;
  modelName: string;
  displayName: string;
  vision: boolean;
  tools: boolean;
  contextLength: number | null;
  maxOutputTokens: number | null;
  source: "discovered" | "manual";
  available: boolean;
}

const PROTOCOL_LABEL: Record<Protocol, string> = {
  openai: "OpenAI-compatible",
  anthropic: "Anthropic-compatible",
  gemini: "Gemini-compatible",
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(body?.msg ?? `request failed (${res.status})`);
  }
  return body as T;
}

function statusLabel(p: Provider): string {
  if (!p.enabled) return "Disabled";
  if (!p.hasApiKey) return "No API key";
  return "Ready";
}

function endpointSummary(p: Provider): string {
  const protocols = Object.keys(p.endpoints) as Protocol[];
  return protocols.length > 0
    ? protocols.join(" + ")
    : "no endpoints configured";
}

export function MaasProviderSettings() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Provider | "new" | null>(null);

  async function reload() {
    setLoading(true);
    try {
      setProviders(await api<Provider[]>("/api/maas/providers"));
    } catch (e) {
      showToast((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <List>
      <ListItem
        title="MaaS Providers"
        subTitle="Model gateways this deployment can use - add at least one before you can chat"
      >
        <IconButton
          icon={<AddIcon />}
          text="Add Provider"
          onClick={() => setEditing("new")}
        />
      </ListItem>

      {loading ? (
        <ListItem title="Loading providers..." />
      ) : providers.length === 0 ? (
        <ListItem
          title="No providers configured yet"
          subTitle='Click "Add Provider" above to connect a MaaS gateway'
        />
      ) : (
        providers.map((p) => (
          <ProviderRow
            key={p.id}
            provider={p}
            onEdit={() => setEditing(p)}
            onChanged={reload}
          />
        ))
      )}

      {editing && (
        <ProviderFormModal
          provider={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            reload();
          }}
        />
      )}
    </List>
  );
}

function ProviderRow(props: {
  provider: Provider;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const p = props.provider;
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  async function runTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const { results } = await api<{
        results: Array<{
          protocol: string;
          ok: boolean;
          modelCount?: number;
          error?: string;
        }>;
      }>(`/api/maas/providers/${p.id}/test`, { method: "POST" });
      setTestResult(
        results
          .map((r) =>
            r.ok
              ? `${r.protocol}: OK (${r.modelCount} models)`
              : `${r.protocol}: FAILED - ${r.error}`,
          )
          .join("  ·  "),
      );
    } catch (e) {
      setTestResult((e as Error).message);
    } finally {
      setTesting(false);
    }
  }

  async function remove() {
    if (
      !(await showConfirm(
        `Delete provider "${p.label}"? This also deletes its configured models.`,
      ))
    ) {
      return;
    }
    try {
      await api(`/api/maas/providers/${p.id}`, { method: "DELETE" });
      props.onChanged();
    } catch (e) {
      showToast((e as Error).message);
    }
  }

  return (
    <ListItem
      title={`${p.label} · ${statusLabel(p)}`}
      subTitle={
        testResult ??
        `${endpointSummary(p)} · ${p.apiKeyMasked ?? "no key stored"}`
      }
    >
      <div style={{ display: "flex", gap: "8px" }}>
        <IconButton
          icon={<ResetIcon />}
          text={testing ? "Testing..." : "Test"}
          onClick={runTest}
          disabled={testing}
        />
        <IconButton icon={<EditIcon />} text="Edit" onClick={props.onEdit} />
        <IconButton icon={<DeleteIcon />} text="Delete" onClick={remove} />
      </div>
    </ListItem>
  );
}

function ProviderFormModal(props: {
  provider: Provider | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = props.provider === null;
  const [providerId, setProviderId] = useState<string | null>(
    props.provider?.id ?? null,
  );
  const [label, setLabel] = useState(props.provider?.label ?? "");
  const [enabled, setEnabled] = useState(props.provider?.enabled ?? true);
  const [openaiEnabled, setOpenaiEnabled] = useState(
    !!props.provider?.endpoints.openai,
  );
  const [openaiUrl, setOpenaiUrl] = useState(
    props.provider?.endpoints.openai?.baseUrl ?? "",
  );
  const [anthropicEnabled, setAnthropicEnabled] = useState(
    !!props.provider?.endpoints.anthropic,
  );
  const [anthropicUrl, setAnthropicUrl] = useState(
    props.provider?.endpoints.anthropic?.baseUrl ?? "",
  );
  const [anthropicVersion, setAnthropicVersion] = useState(
    props.provider?.endpoints.anthropic?.version ?? "",
  );
  const [geminiEnabled, setGeminiEnabled] = useState(
    !!props.provider?.endpoints.gemini,
  );
  const [geminiUrl, setGeminiUrl] = useState(
    props.provider?.endpoints.gemini?.baseUrl ?? "",
  );
  const [apiKey, setApiKey] = useState("");
  const [hasStoredKey, setHasStoredKey] = useState(!!props.provider?.hasApiKey);
  const [saving, setSaving] = useState(false);

  function buildEndpoints(): ProviderEndpoints {
    const endpoints: ProviderEndpoints = {};
    if (openaiEnabled && openaiUrl.trim()) {
      endpoints.openai = { baseUrl: openaiUrl.trim() };
    }
    if (anthropicEnabled && anthropicUrl.trim()) {
      endpoints.anthropic = {
        baseUrl: anthropicUrl.trim(),
        version: anthropicVersion.trim() || undefined,
      };
    }
    if (geminiEnabled && geminiUrl.trim()) {
      endpoints.gemini = { baseUrl: geminiUrl.trim() };
    }
    return endpoints;
  }

  async function save() {
    if (!label.trim()) {
      showToast("Label is required");
      return;
    }
    const endpoints = buildEndpoints();
    if (Object.keys(endpoints).length === 0) {
      showToast("Enable and fill in at least one endpoint");
      return;
    }
    if (isNew && !apiKey.trim()) {
      if (
        !(await showConfirm(
          "No API key entered - save anyway? (only fine for keyless local servers)",
        ))
      ) {
        return;
      }
    }

    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        label: label.trim(),
        enabled,
        endpoints,
      };
      if (apiKey.trim()) body.apiKey = apiKey.trim();

      if (providerId) {
        await api(`/api/maas/providers/${providerId}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      } else {
        const created = await api<Provider>("/api/maas/providers", {
          method: "POST",
          body: JSON.stringify(body),
        });
        setProviderId(created.id);
      }
      setApiKey("");
      setHasStoredKey(hasStoredKey || !!apiKey.trim());
      showToast("Saved");
      props.onSaved();
    } catch (e) {
      showToast((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-mask">
      <Modal
        title={isNew ? "Add MaaS Provider" : `Edit ${props.provider?.label}`}
        onClose={props.onClose}
        actions={[
          <IconButton
            key="cancel"
            icon={<CancelIcon />}
            text="Close"
            onClick={props.onClose}
          />,
          <IconButton
            key="save"
            icon={<ConfirmIcon />}
            text={saving ? "Saving..." : "Save"}
            type="primary"
            disabled={saving}
            onClick={save}
          />,
        ]}
      >
        <List>
          <ListItem title="Label">
            <input
              aria-label="Label"
              type="text"
              value={label}
              placeholder="e.g. Personal MaaS"
              onChange={(e) => setLabel(e.currentTarget.value)}
            />
          </ListItem>

          <ListItem title="Enabled">
            <input
              aria-label="Enabled"
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.currentTarget.checked)}
            />
          </ListItem>

          <EndpointFields
            label="OpenAI-compatible endpoint"
            enabled={openaiEnabled}
            onEnabledChange={setOpenaiEnabled}
            baseUrl={openaiUrl}
            onBaseUrlChange={setOpenaiUrl}
          />

          <EndpointFields
            label="Anthropic-compatible endpoint"
            enabled={anthropicEnabled}
            onEnabledChange={setAnthropicEnabled}
            baseUrl={anthropicUrl}
            onBaseUrlChange={setAnthropicUrl}
            extra={
              anthropicEnabled && (
                <ListItem title="Anthropic API version" vertical>
                  <input
                    aria-label="Anthropic API version"
                    type="text"
                    value={anthropicVersion}
                    placeholder="2023-06-01"
                    onChange={(e) => setAnthropicVersion(e.currentTarget.value)}
                  />
                </ListItem>
              )
            }
          />

          <EndpointFields
            label="Gemini-compatible endpoint"
            enabled={geminiEnabled}
            onEnabledChange={setGeminiEnabled}
            baseUrl={geminiUrl}
            onBaseUrlChange={setGeminiUrl}
          />

          <ListItem
            title="API Key"
            subTitle={
              hasStoredKey
                ? "A key is already stored - leave blank to keep it"
                : "Shared across every enabled endpoint above"
            }
          >
            <PasswordInput
              aria="API Key"
              aria-label="API Key"
              value={apiKey}
              placeholder={hasStoredKey ? "•••••••• (unchanged)" : "sk-..."}
              onChange={(e) => setApiKey(e.currentTarget.value)}
            />
          </ListItem>
          {hasStoredKey && providerId && (
            <RevealKeyRow providerId={providerId} />
          )}
        </List>

        {providerId && (
          <ModelManagement
            providerId={providerId}
            endpoints={buildEndpoints()}
          />
        )}
      </Modal>
    </div>
  );
}

function EndpointFields(props: {
  label: string;
  enabled: boolean;
  onEnabledChange: (v: boolean) => void;
  baseUrl: string;
  onBaseUrlChange: (v: string) => void;
  extra?: React.ReactNode;
}) {
  return (
    <>
      <ListItem title={props.label}>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <input
            aria-label={`Enable ${props.label}`}
            type="checkbox"
            checked={props.enabled}
            onChange={(e) => props.onEnabledChange(e.currentTarget.checked)}
          />
          {props.enabled && (
            <input
              aria-label={`${props.label} base URL`}
              type="text"
              style={{ minWidth: "260px" }}
              value={props.baseUrl}
              placeholder="https://..."
              onChange={(e) => props.onBaseUrlChange(e.currentTarget.value)}
            />
          )}
        </div>
      </ListItem>
      {props.extra}
    </>
  );
}

function RevealKeyRow(props: { providerId: string }) {
  const [revealed, setRevealed] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function reveal() {
    setLoading(true);
    try {
      const { apiKey } = await api<{ apiKey: string }>(
        `/api/maas/providers/${props.providerId}/reveal`,
        { method: "POST" },
      );
      setRevealed(apiKey);
    } catch (e) {
      showToast((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <ListItem title="Stored key" subTitle={revealed ?? undefined}>
      <IconButton
        icon={<EyeIcon />}
        text={loading ? "Loading..." : revealed ? "Hide" : "Show stored key"}
        onClick={() => (revealed ? setRevealed(null) : reveal())}
      />
    </ListItem>
  );
}

function ModelManagement(props: {
  providerId: string;
  endpoints: ProviderEndpoints;
}) {
  const [models, setModels] = useState<ModelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [discovering, setDiscovering] = useState<Protocol | null>(null);
  const [showAddModel, setShowAddModel] = useState(false);

  async function reload() {
    setLoading(true);
    try {
      const all =
        await api<Array<ModelRow & { providerId: string }>>("/api/maas/models");
      setModels(all.filter((m) => m.providerId === props.providerId));
    } catch (e) {
      showToast((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.providerId]);

  async function discover(protocol: Protocol) {
    setDiscovering(protocol);
    try {
      await api(`/api/maas/providers/${props.providerId}/discover`, {
        method: "POST",
        body: JSON.stringify({ protocol }),
      });
      await reload();
      showToast(`Refreshed ${PROTOCOL_LABEL[protocol]} models`);
    } catch (e) {
      showToast((e as Error).message);
    } finally {
      setDiscovering(null);
    }
  }

  async function removeModel(id: string) {
    try {
      await api(`/api/maas/models/${id}`, { method: "DELETE" });
      await reload();
    } catch (e) {
      showToast((e as Error).message);
    }
  }

  const enabledProtocols = Object.keys(props.endpoints) as Protocol[];

  return (
    <List>
      <ListItem
        title="Models"
        subTitle="Discovered automatically, or add one by hand below"
      >
        <div style={{ display: "flex", gap: "8px" }}>
          {enabledProtocols.map((protocol) => (
            <IconButton
              key={protocol}
              icon={<ResetIcon />}
              text={
                discovering === protocol
                  ? "Refreshing..."
                  : `Refresh ${protocol}`
              }
              disabled={discovering !== null}
              onClick={() => discover(protocol)}
            />
          ))}
          <IconButton
            icon={<AddIcon />}
            text="Add manually"
            onClick={() => setShowAddModel(true)}
          />
        </div>
      </ListItem>

      {loading ? (
        <ListItem title="Loading models..." />
      ) : models.length === 0 ? (
        <ListItem title="No models yet - refresh or add one manually" />
      ) : (
        models.map((m) => (
          <ModelRowItem key={m.id} model={m} onRemoved={reload} />
        ))
      )}

      {showAddModel && (
        <AddModelForm
          providerId={props.providerId}
          protocols={enabledProtocols}
          onClose={() => setShowAddModel(false)}
          onAdded={() => {
            setShowAddModel(false);
            reload();
          }}
        />
      )}
    </List>
  );
}

function ModelRowItem(props: { model: ModelRow; onRemoved: () => void }) {
  const m = props.model;

  async function remove() {
    if (!(await showConfirm(`Remove model "${m.displayName}"?`))) return;
    try {
      await api(`/api/maas/models/${m.id}`, { method: "DELETE" });
      props.onRemoved();
    } catch (e) {
      showToast((e as Error).message);
    }
  }

  return (
    <ListItem
      title={m.displayName}
      subTitle={`${m.modelName} · ${PROTOCOL_LABEL[m.protocol]} · ${m.source}${
        m.available ? "" : " · unavailable"
      }`}
    >
      <IconButton icon={<DeleteIcon />} text="Remove" onClick={remove} />
    </ListItem>
  );
}

function AddModelForm(props: {
  providerId: string;
  protocols: Protocol[];
  onClose: () => void;
  onAdded: () => void;
}) {
  const [protocol, setProtocol] = useState<Protocol>(
    props.protocols[0] ?? "openai",
  );
  const [modelName, setModelName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);

  async function add() {
    if (!modelName.trim()) {
      showToast("Model name is required");
      return;
    }
    setSaving(true);
    try {
      await api("/api/maas/models", {
        method: "POST",
        body: JSON.stringify({
          providerId: props.providerId,
          protocol,
          modelName: modelName.trim(),
          displayName: displayName.trim() || undefined,
        }),
      });
      props.onAdded();
    } catch (e) {
      showToast((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ListItem title="New model" vertical>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <select
          aria-label="Protocol"
          value={protocol}
          onChange={(e) => setProtocol(e.currentTarget.value as Protocol)}
        >
          {props.protocols.map((p) => (
            <option value={p} key={p}>
              {PROTOCOL_LABEL[p]}
            </option>
          ))}
        </select>
        <input
          aria-label="Model name"
          type="text"
          placeholder="model name (sent to the API)"
          value={modelName}
          onChange={(e) => setModelName(e.currentTarget.value)}
        />
        <input
          aria-label="Display name"
          type="text"
          placeholder="display name (optional)"
          value={displayName}
          onChange={(e) => setDisplayName(e.currentTarget.value)}
        />
        <IconButton
          icon={<ConfirmIcon />}
          text={saving ? "Adding..." : "Add"}
          disabled={saving}
          onClick={add}
        />
        <IconButton
          icon={<CancelIcon />}
          text="Cancel"
          onClick={props.onClose}
        />
      </div>
    </ListItem>
  );
}
