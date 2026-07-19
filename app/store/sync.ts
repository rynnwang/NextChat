import { getClientConfig } from "../config/client";
import { StoreKey } from "../constant";
import { createPersistStore } from "../utils/store";
import {
  AppState,
  getLocalAppState,
  GetStoreState,
  mergeAppState,
  setLocalAppState,
} from "../utils/sync";
import { downloadAs, readFromFile } from "../utils";
import { showToast } from "../components/ui-lib";
import Locale from "../locales";
import { createSyncClient, ProviderType } from "../utils/cloud";

const isApp = !!getClientConfig()?.isApp;
export type SyncStore = GetStoreState<typeof useSyncStore>;

const DEFAULT_SYNC_STATE = {
  lastSyncTime: 0,
};

export const useSyncStore = createPersistStore(
  DEFAULT_SYNC_STATE,
  (set, get) => ({
    // Chat-history backup always targets this deployment's own Cloudflare
    // D1 + R2 bindings - there's nothing for a single-user deployment to
    // configure, so this is only false when the app isn't running as a
    // Cloudflare Worker at all (e.g. the exported desktop/static build).
    cloudSync() {
      return !isApp;
    },

    markSyncTime() {
      set({ lastSyncTime: Date.now() });
    },

    export() {
      const state = getLocalAppState();
      const datePart = isApp
        ? `${new Date().toLocaleDateString().replace(/\//g, "_")} ${new Date()
            .toLocaleTimeString()
            .replace(/:/g, "_")}`
        : new Date().toLocaleString();

      const fileName = `Backup-${datePart}.json`;
      downloadAs(JSON.stringify(state), fileName);
    },

    async import() {
      const rawContent = await readFromFile();

      try {
        const remoteState = JSON.parse(rawContent) as AppState;
        const localState = getLocalAppState();
        mergeAppState(localState, remoteState);
        setLocalAppState(localState);
        location.reload();
      } catch (e) {
        console.error("[Import]", e);
        showToast(Locale.Settings.Sync.ImportFailed);
      }
    },

    getClient() {
      return createSyncClient(ProviderType.D1R2);
    },

    async sync() {
      const localState = getLocalAppState();
      const client = this.getClient();

      try {
        const remoteRaw = await client.get("app-state");
        if (!remoteRaw || remoteRaw === "") {
          await client.set("app-state", JSON.stringify(localState));
          console.log(
            "[Sync] Remote state is empty, using local state instead.",
          );
          return;
        } else {
          const parsedRemoteState = JSON.parse(remoteRaw) as AppState;
          mergeAppState(localState, parsedRemoteState);
          setLocalAppState(localState);
        }
      } catch (e) {
        console.log("[Sync] failed to get remote state", e);
        throw e;
      }

      await client.set("app-state", JSON.stringify(localState));

      this.markSyncTime();
    },

    async check() {
      const client = this.getClient();
      return await client.check();
    },
  }),
  {
    name: StoreKey.Sync,
    version: 2,

    migrate(persistedState, version) {
      // v1.x persisted webdav/upstash provider config that no longer exists;
      // only lastSyncTime carries forward.
      const old = persistedState as { lastSyncTime?: number };
      return { lastSyncTime: old.lastSyncTime ?? 0 } as any;
    },
  },
);
