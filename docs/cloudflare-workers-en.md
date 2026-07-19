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

You asked to do the **first deployment by hand from the Cloudflare dashboard**, so everything
below is portal clicks, not CLI commands — Cloudflare will run the build/deploy commands for you
on every push once it's connected to your fork.

## 1. Prerequisites

- A Cloudflare account (the Free plan is enough).
- Your fork of this repo pushed to GitHub (you said this is already done).
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
2. In the left sidebar go to **Compute (Workers)** (this is a separate top-level section from
   "Workers & Pages → Pages").
3. Click **Create** → **Import a Git repository**.
4. Authorize Cloudflare's GitHub app if prompted, then pick your NextChat fork.
5. **Project/Worker name**: use the default or pick your own — it becomes part of your
   `<name>.<subdomain>.workers.dev` URL. If you change it, also update `name` in
   [`wrangler.jsonc`](../wrangler.jsonc) to match (or just leave the default `nextchat`).
6. **Build settings**:
   - **Build command**: `npm run cf:build` (or `yarn cf:build` if you keep Yarn as the package
     manager — either works since this repo ships a `yarn.lock`).
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
7. **Environment variables**: click **Add variable** for each one you need (see the table below).
   Mark API keys as **Secret**, not plain text. At minimum add your provider key, e.g.
   `OPENAI_API_KEY`.
8. Click **Save and Deploy**. The first build takes a couple of minutes; Cloudflare streams the
   build log on screen.
9. Once it's live, open the `*.workers.dev` URL Cloudflare gives you and confirm the chat UI
   loads and a message actually round-trips to your model provider.

From now on, every push to your production branch triggers a new build+deploy automatically —
that part is no longer a manual step.

## 3. Environment variables

Same variables as any other NextChat deployment — see [`.env.template`](../.env.template) for the
full list. The common ones:

| Variable | Required | Purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` | one of the provider keys is required | OpenAI access |
| `ANTHROPIC_API_KEY` / `GOOGLE_API_KEY` / `DEEPSEEK_API_KEY` / ... | no | Enable other providers |
| `CODE` | no | Comma-separated access password(s) for the deployed instance |
| `BASE_URL` | no | Override the upstream OpenAI-compatible base URL |
| `HIDE_USER_API_KEY` | no | Set `1` to stop visitors entering their own key |
| `ENABLE_MCP` | no | Set `true` to enable MCP tool-calling |
| `WHITE_WEBDAV_ENDPOINTS` | no | Allow-list of WebDAV hosts for chat-log sync |

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
- If you outgrow the free plan, the Workers Paid plan removes the daily request cap and is billed
  per-request/CPU-ms rather than a flat "Pages Functions" style tier.

## 5. Local build/preview (optional)

You don't need this for the dashboard-driven flow above, but if you want to test the Cloudflare
build locally before pushing:

```bash
yarn cf:build     # yarn mask, then next build + OpenNext transform into .open-next/
yarn cf:preview   # builds, then runs the Worker locally via Wrangler
```

`yarn cf:preview` runs the actual Worker bundle (not `next dev`), so it's the closest thing to a
production dry run you can get without deploying.

## 6. Troubleshooting

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
