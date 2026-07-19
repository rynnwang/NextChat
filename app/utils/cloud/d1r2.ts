// Backs the chat-history sync feature with this deployment's own Cloudflare
// D1 (sync metadata) + R2 (the actual blob) bindings, via the /api/sync/*
// routes - no user-entered credentials, since a single-user deployment only
// ever has one backend to talk to.
export type D1R2Client = ReturnType<typeof createD1R2Client>;

export function createD1R2Client() {
  return {
    async check() {
      try {
        const res = await fetch("/api/sync/meta", { method: "GET" });
        return res.ok;
      } catch (e) {
        console.error("[D1R2] failed to check", e);
        return false;
      }
    },

    async get(_key: string) {
      const res = await fetch("/api/sync/blob", { method: "GET" });
      if (res.status === 404) return "";
      if (!res.ok) {
        throw new Error(`failed to fetch sync blob: ${res.status}`);
      }
      return await res.text();
    },

    async set(_key: string, value: string) {
      const res = await fetch("/api/sync/blob", {
        method: "PUT",
        body: value,
      });
      if (!res.ok) {
        throw new Error(`failed to store sync blob: ${res.status}`);
      }
    },
  };
}
