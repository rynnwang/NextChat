import { createD1R2Client } from "./d1r2";

export enum ProviderType {
  D1R2 = "d1r2",
}

export const SyncClients = {
  [ProviderType.D1R2]: createD1R2Client,
} as const;

export type SyncClient = {
  get: (key: string) => Promise<string>;
  set: (key: string, value: string) => Promise<void>;
  check: () => Promise<boolean>;
};

export function createSyncClient(provider: ProviderType): SyncClient {
  return SyncClients[provider]() as any;
}
