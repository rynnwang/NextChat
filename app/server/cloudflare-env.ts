import type {
  KVNamespace,
  D1Database,
  R2Bucket,
} from "@cloudflare/workers-types";
import { getCloudflareContext } from "@opennextjs/cloudflare";

// Not using the generated `cloudflare-env.d.ts` (it's gitignored and only
// exists after `yarn cf:typegen`) so this typechecks without that step.
export interface CloudflareBindings {
  AUTH_KV: KVNamespace;
  CHAT_DB: D1Database;
  CHAT_FILES: R2Bucket;
}

export function getBindings(): CloudflareBindings {
  return getCloudflareContext().env as unknown as CloudflareBindings;
}
