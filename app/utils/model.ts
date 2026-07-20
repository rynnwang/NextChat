import { ServiceProvider } from "../constant";
import { LLMModel } from "../client/api";

interface MaasModelWithProvider {
  providerId: string;
  providerLabel: string;
  providerEnabled: boolean;
  protocol: "openai" | "anthropic" | "gemini";
  modelName: string;
  displayName: string;
  available: boolean;
  sortOrder: number;
}

function protocolToServiceProvider(
  protocol: MaasModelWithProvider["protocol"],
): ServiceProvider {
  switch (protocol) {
    case "anthropic":
      return ServiceProvider.Anthropic;
    case "gemini":
      return ServiceProvider.Google;
    default:
      return ServiceProvider.OpenAI;
  }
}

// Fetches every model across every configured MaaS provider (see
// app/server/maas-store.ts) - this is the sole source of selectable models
// now; there is no built-in fallback list.
export async function fetchMaasModels(): Promise<LLMModel[]> {
  const res = await fetch("/api/maas/models", { credentials: "same-origin" });
  if (!res.ok) {
    throw new Error(`GET /api/maas/models failed: ${res.status}`);
  }
  const rows = (await res.json()) as MaasModelWithProvider[];
  return rows.map((row) => ({
    name: row.modelName,
    displayName: row.displayName,
    available: row.available && row.providerEnabled,
    sorted: row.sortOrder,
    provider: {
      id: row.providerId,
      providerName: protocolToServiceProvider(row.protocol),
      providerType: row.protocol === "gemini" ? "google" : row.protocol,
      maasProviderLabel: row.providerLabel,
      sorted: row.sortOrder,
    },
  }));
}

/**
 * Sorts an array of models based on specified rules.
 *
 * First, sorted by provider; if the same, sorted by model
 */
const sortModelTable = (
  models: ReturnType<typeof collectModelsWithDefaultModel>,
) =>
  models.sort((a, b) => {
    if (a.provider && b.provider) {
      let cmp = a.provider.sorted - b.provider.sorted;
      return cmp === 0 ? a.sorted - b.sorted : cmp;
    } else {
      return a.sorted - b.sorted;
    }
  });

/**
 * get model name and provider from a formatted string,
 * e.g. `gpt-4@OpenAi` or `claude-3-5-sonnet@20240620@Google`
 * @param modelWithProvider model name with provider separated by last `@` char,
 * @returns [model, provider] tuple, if no `@` char found, provider is undefined
 */
export function getModelProvider(modelWithProvider: string): [string, string?] {
  const [model, provider] = modelWithProvider.split(/@(?!.*@)/);
  return [model, provider];
}

export function collectModelTable(models: readonly LLMModel[]) {
  const modelTable: Record<
    string,
    {
      available: boolean;
      name: string;
      displayName: string;
      sorted: number;
      provider?: LLMModel["provider"]; // Marked as optional
      isDefault?: boolean;
    }
  > = {};

  models.forEach((m) => {
    // using <modelName>@<providerId> as fullName
    modelTable[`${m.name}@${m?.provider?.id}`] = {
      ...m,
      displayName: m.name, // 'provider' is copied over if it exists
    };
  });

  return modelTable;
}

export function collectModelTableWithDefaultModel(
  models: readonly LLMModel[],
  defaultModel: string,
) {
  let modelTable = collectModelTable(models);
  if (defaultModel && defaultModel !== "") {
    if (defaultModel.includes("@")) {
      if (defaultModel in modelTable) {
        modelTable[defaultModel].isDefault = true;
      }
    } else {
      for (const key of Object.keys(modelTable)) {
        if (
          modelTable[key].available &&
          getModelProvider(key)[0] == defaultModel
        ) {
          modelTable[key].isDefault = true;
          break;
        }
      }
    }
  }
  return modelTable;
}

export function collectModelsWithDefaultModel(
  models: readonly LLMModel[],
  defaultModel: string,
) {
  const modelTable = collectModelTableWithDefaultModel(models, defaultModel);
  let allModels = Object.values(modelTable);

  allModels = sortModelTable(allModels);

  return allModels;
}
