import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// NextChat has no ISR/SSG pages (everything is either a client component or a
// dynamic API route), so the default in-memory/no-op cache adapters are
// sufficient here - no KV/R2/D1 bindings are required for a basic deployment.
export default defineCloudflareConfig();
