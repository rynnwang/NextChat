# Deploying to Cloudflare Workers (free tier)

> This repo previously had a Cloudflare Pages deployment guide, built on
> `@cloudflare/next-on-pages`. It's been removed: Cloudflare Pages cannot deploy this repo at all
> anymore (its build pipeline doesn't understand the `wrangler.jsonc` Worker+assets setup below —
> see the callout in step 2). Cloudflare now recommends deploying Next.js apps as a **Worker**
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
  static assets binding. Deliberately does **not** declare the KV/D1/R2 bindings below — see why
  in step 2.
- [`wrangler.dev.jsonc`](../wrangler.dev.jsonc) — a local-dev-only copy that *does* declare those
  bindings, so `yarn cf:preview`/`yarn dev`/the `cf:d1:migrate:*` scripts can still emulate/target
  them. Not used by Cloudflare's deploy at all.
- [`open-next.config.ts`](../open-next.config.ts) — OpenNext's Cloudflare build configuration.
- `yarn cf:build` / `yarn cf:preview` / `yarn cf:deploy` — package.json scripts that wrap the
  OpenNext + Wrangler CLIs, for local builds/testing if you ever want them.

This deployment is single-user: the first visit shows a one-time setup page to choose a site-wide
password (stored, PBKDF2-hashed, in a Cloudflare KV namespace), and every visit after that
requires logging in with it via a signed session cookie. Chat-history backup/sync (Settings →
"Sync") is backed by this same deployment's own Cloudflare D1 (sync metadata) and R2 (the actual
backup blob) — there's nothing to configure client-side, but you do need to create all three
resources (KV, D1, R2) and bind them to the Worker before your first deploy — see step 2 below.

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
   **Storage & Databases** in the left sidebar. Use these exact names (D1's name is hardcoded in
   the migration tooling; the others don't strictly have to match, but there's no reason to
   improvise):

   | Resource | Product/action | Create it named exactly | Binding name (fixed, don't change) |
   | --- | --- | --- | --- |
   | Site login | KV → **Create namespace** | `nextchat-auth` | `AUTH_KV` |
   | Chat-history sync metadata | D1 SQL Database → **Create database** | `nextchat-db` | `CHAT_DB` |
   | Chat-history sync blob | R2 Object Storage → **Create bucket** | `nextchat-chat-files` | `CHAT_FILES` |

   > **Why bindings go in the dashboard here, not in `wrangler.jsonc`.** The deployed
   > `wrangler.jsonc` deliberately does not declare any of these three bindings. This repo's Worker
   > auto-redeploys via `wrangler deploy` on every push, and Wrangler treats that file as
   > authoritative for a Worker's bindings — if it declared them (even correctly), every deploy
   > would re-apply whatever's committed, discarding anything you'd changed by hand afterward. This
   > is the opposite tradeoff from putting real IDs in the file: it keeps them out of a public repo,
   > at the cost of a manual per-binding step below. **This is unverified**: Cloudflare's own docs
   > don't fully confirm that omitting a binding from config (as opposed to declaring a wrong value)
   > reliably survives every subsequent deploy. Test it yourself once you're done — rebind, push
   > something trivial, and check Settings → Bindings afterward. If a binding ever reverts to
   > missing after a routine push, that's this assumption not holding for your setup; the fallback
   > that's guaranteed to work is putting the real ID into `wrangler.jsonc` directly (see the
   > comment there for exactly which field), or making your fork private so the IDs being in git no
   > longer matters.

   For each resource above, after creating it: open its detail page, find the **Bindings** section
   for *this specific Worker* — for a Worker not yet created, you'll do this from the Worker's own
   **Settings → Bindings → Add binding** once you reach step 6 below; come back to this list then.
   Pick the matching type (KV Namespace / D1 Database / R2 Bucket), the resource you just created,
   and type the exact binding name from the table above.

   For D1 specifically, also open `nextchat-db`'s **Console** tab (still no CLI needed) and run the
   contents of [`migrations/0001_create_sync_state.sql`](../migrations/0001_create_sync_state.sql)
   — this creates the one small table sync metadata lives in.
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
   build log on screen. It should succeed even though the bindings aren't attached yet — the
   deployed `wrangler.jsonc` doesn't declare them, so there's nothing to fail deploy-time
   validation. Login/setup and sync will error at runtime until the next step is done.
10. Once it's live, attach the three bindings: go to the Worker's own **Settings → Bindings** tab
    (not the KV/D1/R2 resource's own page) → **Add binding**, and for each row from the table in
    step 2, pick the matching resource type, select the resource you created, and type the exact
    binding name (`AUTH_KV`, `CHAT_DB`, `CHAT_FILES`). No redeploy needed — these take effect
    immediately.
11. Open the `*.workers.dev` URL Cloudflare gives you. You should land on a one-time setup page —
    choose a password there (write it down, it can't be recovered or reset without manually
    clearing the KV namespace), then confirm you can log back in, that a chat message round-trips
    to your model provider, and that Settings → "Sync" shows a working "Sync" button (confirms the
    D1/R2 bindings are wired up correctly).

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
`.wrangler/` and persists across runs. All three commands above (and plain `yarn dev`) read
[`wrangler.dev.jsonc`](../wrangler.dev.jsonc) for bindings, not the deployed `wrangler.jsonc` —
the placeholder KV/D1 IDs already in that file are fine to leave as-is for local emulation, since
Wrangler never calls the real Cloudflare API for local (non-`--remote`) dev/preview.

## 6. Troubleshooting

- **The setup/login page errors out, `/api/session` returns an error instead of
  `{configured, authenticated}`, or Settings → "Sync" errors with a "binding not found" message**
  — the Worker doesn't have `AUTH_KV`/`CHAT_DB`/`CHAT_FILES` attached under its own **Settings →
  Bindings** tab yet (step 10), or you created the D1 database but never ran the migration (the
  `sync_state` table doesn't exist — step 2, one SQL statement pasted into the D1 database's
  **Console** tab).
- **A binding that was working suddenly shows "not found" again after a routine push, with no
  config changes on your end** — this is the risk called out in step 2: the deployed
  `wrangler.jsonc` omits these bindings specifically so a normal `wrangler deploy` won't clobber
  them, but this isn't confirmed to hold in every case. If it happens, re-attach the binding under
  Settings → Bindings and treat it as evidence the assumption didn't hold for your setup — the
  fallback that's guaranteed to survive every deploy is putting the real ID into `wrangler.jsonc`
  directly (see the comment block there for the exact field), or making your fork private.
- **You changed `wrangler.dev.jsonc`'s R2 `bucket_name` (for local testing) to something that
  fails with `r2_buckets[0].bucket_name="..." is invalid`** — R2 bucket names must be lowercase
  letters/numbers/hyphens only (no underscores/uppercase), 3-63 characters. This only affects local
  `yarn cf:preview`/`cf:d1:migrate:*` runs, since the deployed `wrangler.jsonc` doesn't declare R2
  at all.
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
