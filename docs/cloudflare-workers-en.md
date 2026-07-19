# Deploying to Cloudflare Workers (free tier)

> This replaces the older [Cloudflare Pages guide](./cloudflare-pages-en.md), which relied on
> `@cloudflare/next-on-pages`. Cloudflare now recommends deploying Next.js apps as a **Worker**
> (with static assets) built by the [OpenNext Cloudflare adapter](https://opennext.js.org/cloudflare)
> instead — it supports the regular Node.js runtime (this app's API routes use it by default),
> so nothing has to be rewritten for the "Edge" runtime the old approach required.

NextChat fits comfortably on Cloudflare's free plan: every API route is a stateless fetch-based
proxy to a model provider (no filesystem access, no background jobs, no ISR/static regeneration),
which is exactly what Workers are built for. Streaming chat responses (SSE) also work fine — the
Workers Free plan's CPU-time limit only counts active compute, not time spent waiting on the
upstream API, so a long streamed response barely uses any of your daily CPU-time budget.

This repo already contains everything needed to build a Worker:

- [`wrangler.jsonc`](../wrangler.jsonc) — the Worker's name, compatibility date/flags, and its
  static assets binding.
- [`open-next.config.ts`](../open-next.config.ts) — OpenNext's Cloudflare build configuration.
- `yarn cf:build` / `yarn cf:preview` / `yarn cf:deploy` — package.json scripts that wrap the
  OpenNext + Wrangler CLIs, for local builds/testing if you ever want them.

This deployment is single-user: the first visit shows a one-time setup page to choose a site-wide
password (stored, PBKDF2-hashed, in a Cloudflare KV namespace), and every visit after that
requires logging in with it via a signed session cookie. Chat-history backup/sync (Settings →
"Sync") is backed by this same deployment's own Cloudflare D1 (sync metadata) and R2 (the actual
backup blob) — there's nothing to configure client-side, but you do need to create all three
resources (KV, D1, R2) before your first deploy — see step 2 below.

This guide covers the **first deployment by hand from the Cloudflare dashboard**, so everything
below is portal clicks, not CLI commands — Cloudflare will run the build/deploy commands for you
on every push once it's connected to your fork.

## 1. Prerequisites

- A Cloudflare account (the Free plan is enough).
- Your fork of this repo pushed to GitHub.
- At least one model provider API key (e.g. `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, ...).

## 2. Create the Worker from the dashboard

> **This must be created as a Worker, not a Pages project.** Cloudflare Pages and Cloudflare
> Workers are two different products with two different build pipelines, even though the
> dashboard groups them under one "Workers & Pages" section. Pages' build runner only understands
> the old `pages_build_output_dir`-style config and does not know how to run the
> `wrangler.jsonc` Worker+assets setup this repo uses — if you connect this repo as a **Pages**
> project, the build fails immediately with an error like *"Found wrangler.json file... did you
> mean to use wrangler.toml to configure Pages?"*, followed by dependency install errors from an
> old, EOL Node version Pages defaults to. If any screen in the flow below has a "Pages" heading
> or tab, back out and find the **Workers** entry point instead.

1. Log in at [dash.cloudflare.com](https://dash.cloudflare.com).
2. Create the three storage resources this fork needs, before your first deploy — all under
   **Storage & Databases** in the left sidebar. **In your fork**, each step below tells you which
   placeholder in [`wrangler.jsonc`](../wrangler.jsonc) to replace with the real ID/name Cloudflare
   gives you; commit and push those edits before continuing (the Worker build reads bindings from
   this file, not from anything you configure in the dashboard).
   1. **KV** (site login) → **Create namespace**, name it something like `nextchat-auth`. Replace
      `REPLACE_WITH_YOUR_AUTH_KV_NAMESPACE_ID` with the namespace ID it gives you.
   2. **D1 SQL Database** (chat-history sync metadata) → **Create database**, name it
      `nextchat-db` (must match `database_name` in `wrangler.jsonc`, already set for you). Replace
      `REPLACE_WITH_YOUR_CHAT_DB_DATABASE_ID` with the database ID it gives you. Then, still in
      the dashboard, open that database's **Console** tab and run the contents of
      [`migrations/0001_create_sync_state.sql`](../migrations/0001_create_sync_state.sql) — this
      creates the one small table sync metadata lives in (no CLI needed).
   3. **R2 Object Storage** (chat-history sync blob) → **Create bucket**. Bucket names must be
      lowercase with hyphens only (no underscores/uppercase) — Cloudflare enforces this and the
      Worker build will refuse to start otherwise. Replace `replace-with-your-r2-bucket-name` in
      `wrangler.jsonc` with the name you chose.

   > **Alternative if you'd rather not commit resource IDs to a public fork**: you can instead
   > leave `wrangler.jsonc`'s `kv_namespaces`/`d1_databases`/`r2_buckets` blocks out entirely and
   > attach the same three bindings by hand under the Worker's **Settings → Bindings** tab in the
   > dashboard, using the exact binding names `AUTH_KV`, `CHAT_DB`, `CHAT_FILES`.
   >
   > **Known risk**: this repo's whole setup is "every push auto-redeploys" via `wrangler deploy`,
   > and Wrangler treats `wrangler.jsonc` as the complete desired state for a Worker's bindings —
   > not a delta to merge with the dashboard. Cloudflare's own guidance is that dashboard-added
   > bindings on a Wrangler-managed Worker get overwritten the next time `wrangler deploy` runs.
   > Since that happens on literally every push here, expect manually-attached bindings to
   > disappear the next time you push anything, reintroducing "binding not found" errors with no
   > obvious cause. Test this yourself before relying on it: bind manually, push an unrelated
   > trivial commit, then check under Settings → Bindings whether it's still there. If it doesn't
   > survive, the two options that reliably keep IDs out of git while still auto-redeploying are
   > making the fork **private** (simplest — nobody but you can see the repo at all), or injecting
   > the real IDs into `wrangler.jsonc` from encrypted dashboard "Secret" environment variables as
   > part of the build step (more moving parts, but keeps the repo public with only placeholders
   > visible) — happy to wire either of those up if this turns out not to hold.
3. In the left sidebar go to **Compute (Workers)** (this is a separate top-level section from
   "Workers & Pages → Pages").
4. Click **Create** → **Import a Git repository**.
5. Authorize Cloudflare's GitHub app if prompted, then pick your NextChat fork.
6. **Project/Worker name**: use the default or pick your own — it becomes part of your
   `<name>.<subdomain>.workers.dev` URL. If you change it, also update `name` in
   [`wrangler.jsonc`](../wrangler.jsonc) to match (or just leave the default `nextchat`).
7. **Build settings**:
   - **Build command**: set this to `yarn cf:build` (or `npm run cf:build`) — **do not leave this
     as `yarn run build`/`next build`**. Cloudflare's Next.js framework preset auto-fills the
     plain `build` script, which only runs `next build` and never invokes the OpenNext transform,
     so `.open-next/` is never produced. `wrangler deploy` then fails at the very last step with
     `ERROR Could not find compiled Open Next config, did you run the build command?` even though
     the Next.js build itself succeeded. If you already created the Worker with the auto-filled
     command, open **Build → Build configuration** (pencil icon) and change it there, then retry
     the deployment — no need to recreate the whole project.
   - Leave **Deploy command** as the default (`npx wrangler deploy`) — Cloudflare detects it from
     `wrangler.jsonc` automatically.
   - You do **not** need to set compatibility flags manually in the dashboard the way the old
     Pages guide required — `nodejs_compat` and `global_fetch_strictly_public` are already
     declared in `wrangler.jsonc` and travel with every build.
   - **Do not set a `NODE_VERSION` environment variable** unless the build log shows the wrong
     version being picked up. This repo pins Node via `.node-version`/`engines` (>=20.19), which
     current build images should read automatically. In particular, don't reuse
     `NODE_VERSION=20.1` from the old, deprecated Pages guide — that exact version is EOL and is
     too old for this project's current tooling (`yargs` alone requires Node ^20.19/^22.12/>=23).
8. **Environment variables**: click **Add variable** for each one you need (see the table below).
   Mark API keys as **Secret**, not plain text. At minimum add your provider key, e.g.
   `OPENAI_API_KEY`.
9. Click **Save and Deploy**. The first build takes a couple of minutes; Cloudflare streams the
   build log on screen.
10. Once it's live, open the `*.workers.dev` URL Cloudflare gives you. You should land on a
    one-time setup page — choose a password there (write it down, it can't be recovered or reset
    without manually clearing the KV namespace), then confirm you can log back in, that a chat
    message round-trips to your model provider, and that Settings → "Sync" shows a working "Sync"
    button (confirms the D1/R2 bindings are wired up correctly).

From now on, every push to your production branch triggers a new build+deploy automatically —
that part is no longer a manual step.

## 3. Environment variables

Same variables as any other NextChat deployment — see [`.env.template`](../.env.template) for the
full list. The common ones:

| Variable | Required | Purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` | one of the provider keys is required | Access to the MaaS gateway's OpenAI-compatible endpoint |
| `ANTHROPIC_API_KEY` / `GOOGLE_API_KEY` | no | Enable the Anthropic/Gemini-compatible endpoints |
| `CODE` | no | Comma-separated access password(s) for the deployed instance |
| `BASE_URL` / `ANTHROPIC_URL` / `GOOGLE_URL` | no | Override the default MaaS gateway URL per provider (see `app/constant.ts`) |
| `HIDE_USER_API_KEY` | no | Set `1` to stop visitors entering their own key |
| `ENABLE_MCP` | no | Set `true` to enable MCP tool-calling |

If you want the "share as link" (Artifacts) feature, also set `CLOUDFLARE_ACCOUNT_ID`,
`CLOUDFLARE_KV_NAMESPACE_ID` and `CLOUDFLARE_KV_API_KEY` — this app talks to Cloudflare's KV REST
API directly (see [`app/api/artifacts/route.ts`](../app/api/artifacts/route.ts)), so it works the
same whether the app itself runs on Cloudflare or elsewhere. Create the KV namespace under
**Storage & Databases → KV** in the same dashboard, and an API token with KV edit permission
under **My Profile → API Tokens**.

## 4. Free tier limits worth knowing

- **Requests**: 100,000 requests/day on the Workers Free plan. Each chat turn is a small number
  of requests (page load + one streamed API call), so this is generous for personal/small-team
  use.
- **CPU time**: capped per request, but only counts active JS execution — time spent streaming
  bytes from the upstream LLM API back to the browser doesn't count against it.
- **Static assets**: served directly from Cloudflare's edge network via the `assets` binding in
  `wrangler.jsonc`, at no extra cost.
- **D1**: 5 GB storage and 5 million rows read/day on the Free plan — this app only ever stores
  one metadata row, so you will not come close to either limit.
- **R2**: 10 GB storage and no egress fees on the Free plan (unlike KV/D1, R2 has no free daily
  request cap worth worrying about for a single-user chat-history backup blob).
- If you outgrow the free plan, the Workers Paid plan removes the daily request cap and is billed
  per-request/CPU-ms rather than a flat "Pages Functions" style tier.

## 5. Local build/preview (optional)

You don't need this for the dashboard-driven flow above, but if you want to test the Cloudflare
build locally before pushing:

```bash
yarn cf:d1:migrate:local  # applies migrations/*.sql to a local emulated D1 database (one-time)
yarn cf:build              # yarn mask, then next build + OpenNext transform into .open-next/
yarn cf:preview             # builds, then runs the Worker locally via Wrangler
```

`yarn cf:preview` runs the actual Worker bundle (not `next dev`), so it's the closest thing to a
production dry run you can get without deploying. Local KV/D1/R2 state is emulated on disk under
`.wrangler/` and persists across runs.

## 6. Troubleshooting

- **The setup/login page errors out, or `/api/session` returns an error instead of
  `{configured, authenticated}`** — the `AUTH_KV` binding in `wrangler.jsonc` still has the
  `REPLACE_WITH_YOUR_AUTH_KV_NAMESPACE_ID` placeholder. Create the namespace and put its real ID
  there (see step 2 above), then redeploy.
- **Build/deploy fails with something like `r2_buckets[0].bucket_name="..." is invalid`** — R2
  bucket names are validated at build time and must be lowercase letters/numbers/hyphens only (no
  underscores or uppercase), 3-63 characters. Unlike the KV namespace ID or D1 database ID (both
  opaque strings wrangler doesn't format-check), the R2 `bucket_name` *is* the literal name, so it
  has to satisfy this format. Fix the `bucket_name` in `wrangler.jsonc` and redeploy.
- **Settings → "Sync" shows an error, or `/api/sync/meta` / `/api/sync/blob` return a 500 with a
  "binding not found" message** — the `CHAT_DB` (D1) or `CHAT_FILES` (R2) binding in
  `wrangler.jsonc` still has its `REPLACE_WITH_...` placeholder, or you created the D1 database but
  never ran the migration (the `sync_state` table doesn't exist yet). See step 2 above — the
  migration is one SQL statement you can paste into the D1 database's **Console** tab in the
  dashboard, no CLI required.
- **The same "binding not found" errors above (or the login/setup page breaking) start happening
  again after a previously-working deploy, with no config file changes** — if you attached
  `AUTH_KV`/`CHAT_DB`/`CHAT_FILES` manually via **Settings → Bindings** instead of declaring them
  in `wrangler.jsonc` (see the alternative note in step 2), this is the expected failure mode: the
  next `wrangler deploy` — which runs on every push — reset the Worker's bindings to match
  `wrangler.jsonc`, which doesn't list them, so they were dropped. Either re-attach them after
  every single deploy, or switch to one of the two more durable approaches noted there.
- **Deploy fails with `ERROR Could not find compiled Open Next config, did you run the build
  command?`, right after a build that otherwise looked successful** — the **Build command** is
  set to the plain `yarn run build`/`next build` instead of `yarn cf:build`. Fix it under
  **Build → Build configuration** in the Worker's settings and retry the deployment; see the note
  in section 2 above.
- **Build log says `Found wrangler.json file... did you mean to use wrangler.toml to configure
  Pages?`** — you connected this repo as a **Pages** project instead of a **Worker**. Delete that
  project and redo section 2 via **Compute (Workers) → Create → Import a Git repository**; Pages
  cannot deploy this repo's Worker+assets setup no matter what config you add.
- **`error yargs@...: The engine "node" is incompatible with this module"` or similar EBADENGINE
  errors** — the build image resolved an old Node version (Cloudflare Pages defaults to `20.1.0`
  if nothing overrides it, which is EOL). Remove any `NODE_VERSION=20.1` variable left over from
  the old Pages guide; the repo's `.node-version`/`engines` fields should otherwise be enough. If
  the build system still doesn't pick it up, explicitly set `NODE_VERSION=22`.
- **A provider request works locally but fails only on Workers** — check the build log for
  `nodejs_compat`-related errors; it's already set in `wrangler.jsonc`, but if you renamed/moved
  that file, Cloudflare won't pick up the flag.
- **`workers.dev` URL works but a custom domain doesn't** — add the domain under the Worker's
  **Settings → Domains & Routes** tab; Cloudflare provisions the certificate automatically once
  the domain's DNS is on Cloudflare.
