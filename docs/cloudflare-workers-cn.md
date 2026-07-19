# 部署到 Cloudflare Workers(免费套餐)

> 本指南替代了旧版的 [Cloudflare Pages 指南](./cloudflare-pages-cn.md),旧指南依赖于
> `@cloudflare/next-on-pages`。Cloudflare 现在推荐将 Next.js 应用部署为 **Worker**(附带静态资源),
> 由 [OpenNext Cloudflare 适配器](https://opennext.js.org/cloudflare) 构建 —— 它支持常规的 Node.js
> 运行时(本项目的 API 路由默认就使用这个运行时),因此不需要为旧方案要求的 "Edge" 运行时重写任何代码。

NextChat 非常适合 Cloudflare 的免费套餐:每一个 API 路由都是无状态的、基于 fetch 的模型服务商代理
(没有文件系统访问,没有后台任务,没有 ISR/静态再生成),这正是 Workers 擅长的场景。流式聊天响应(SSE)
也能正常工作 —— Workers 免费套餐的 CPU 时间限制只计算实际计算耗时,不计算等待上游 API 响应的时间,
所以一次很长的流式响应几乎不会消耗多少每日 CPU 时间额度。

本仓库已经包含了构建 Worker 所需的全部内容:

- [`wrangler.jsonc`](../wrangler.jsonc) —— Worker 的名称、兼容性日期/标志,以及静态资源绑定。
- [`open-next.config.ts`](../open-next.config.ts) —— OpenNext 的 Cloudflare 构建配置。
- `yarn cf:build` / `yarn cf:preview` / `yarn cf:deploy` —— 封装了 OpenNext + Wrangler CLI 的
  package.json 脚本,供你需要本地构建/测试时使用。

本指南只涉及**在 Cloudflare 控制台手动完成的首次部署**,下面全部是控制台的点击操作,而不是 CLI 命令 ——
一旦连接到你的 fork,Cloudflare 会在每次推送时自动运行构建/部署命令。

## 1. 前置条件

- 一个 Cloudflare 账号(免费套餐即可)。
- 已经将本项目的 fork 推送到 GitHub。
- 至少一个模型服务商的 API key(例如 `OPENAI_API_KEY`、`ANTHROPIC_API_KEY` 等)。

## 2. 在控制台创建 Worker

> **必须创建为 Worker,而不是 Pages 项目。** Cloudflare Pages 和 Cloudflare Workers 是两个不同的产品,
> 拥有两套不同的构建流水线,尽管控制台把它们归在同一个 "Workers & Pages" 区域下。Pages 的构建器只认识
> 旧版 `pages_build_output_dir` 风格的配置,不知道如何运行本仓库使用的 `wrangler.jsonc`
> Worker+资源配置 —— 如果你把本仓库连接为 **Pages** 项目,构建会立即失败,报错类似
> *"Found wrangler.json file... did you mean to use wrangler.toml to configure Pages?"*,
> 随后还会因为 Pages 默认使用的过旧、已停止维护的 Node 版本而出现依赖安装错误。如果下面流程中的
> 任何页面出现 "Pages" 的标题或标签页,请退出并寻找 **Workers** 的入口。

1. 登录 [dash.cloudflare.com](https://dash.cloudflare.com)。
2. 在左侧边栏进入 **Compute (Workers)**(这是与 "Workers & Pages → Pages" 完全独立的顶级区域)。
3. 点击 **Create** → **Import a Git repository**。
4. 如有提示,授权 Cloudflare 的 GitHub App,然后选择你 fork 的 NextChat 仓库。
5. **Project/Worker name**:使用默认值,或自行指定 —— 它会成为你的
   `<name>.<subdomain>.workers.dev` 网址的一部分。如果修改了名称,请同步修改
   [`wrangler.jsonc`](../wrangler.jsonc) 中的 `name` 字段(或者直接保留默认值 `nextchat`)。
6. **Build settings(构建设置)**:
   - **Build command(构建命令)**:`npm run cf:build`(如果你继续使用 Yarn 作为包管理器,也可以用
     `yarn cf:build`,两者都可以,因为本仓库自带 `yarn.lock`)。
   - **Deploy command(部署命令)** 保持默认值(`npx wrangler deploy`)即可 —— Cloudflare 会自动从
     `wrangler.jsonc` 中读取。
   - 你**不需要**像旧版 Pages 指南那样在控制台手动配置兼容性标志 —— `nodejs_compat` 和
     `global_fetch_strictly_public` 已经在 `wrangler.jsonc` 中声明好了,每次构建都会自动带上。
   - **不要设置 `NODE_VERSION` 环境变量**,除非构建日志显示读取到了错误的版本。本仓库已经通过
     `.node-version`/`engines`(>=20.19)固定了 Node 版本,目前的构建镜像应当能自动识别。特别提醒:
     不要沿用旧版、已废弃的 Pages 指南中的 `NODE_VERSION=20.1` —— 这个具体版本已经停止维护(EOL),
     对于本项目目前的构建工具来说也太旧了(仅 `yargs` 一项就要求 Node ^20.19/^22.12/>=23)。
7. **Environment variables(环境变量)**:为你需要的每一个变量点击 **Add variable**(见下方表格)。
   API key 请标记为 **Secret(密钥)**,不要用明文。至少需要添加一个模型服务商的 key,例如
   `OPENAI_API_KEY`。
8. 点击 **Save and Deploy**。首次构建需要几分钟,Cloudflare 会在页面上实时显示构建日志。
9. 部署完成后,打开 Cloudflare 提供的 `*.workers.dev` 网址,确认聊天界面能正常加载,并确认发送的消息
   确实能与你的模型服务商完成一次往返。

从此以后,每次推送到你的生产分支都会自动触发新的构建+部署 —— 这一步不再需要手动操作。

## 3. 环境变量

与其他 NextChat 部署方式所需的变量相同 —— 完整列表见 [`.env.template`](../.env.template)。常用的有:

| 变量 | 是否必需 | 用途 |
| --- | --- | --- |
| `OPENAI_API_KEY` | 需要配置其中一个服务商的 key | 使用 OpenAI |
| `ANTHROPIC_API_KEY` / `GOOGLE_API_KEY` / `DEEPSEEK_API_KEY` / ... | 否 | 启用其他服务商 |
| `CODE` | 否 | 部署实例的访问密码,可用逗号分隔多个 |
| `BASE_URL` | 否 | 覆盖上游 OpenAI 兼容 API 的 base URL |
| `HIDE_USER_API_KEY` | 否 | 设为 `1` 可禁止访客自行输入 API key |
| `ENABLE_MCP` | 否 | 设为 `true` 可启用 MCP 工具调用 |
| `WHITE_WEBDAV_ENDPOINTS` | 否 | 聊天记录同步允许使用的 WebDAV 主机白名单 |

如果你想使用"分享为链接"(Artifacts)功能,还需要设置 `CLOUDFLARE_ACCOUNT_ID`、
`CLOUDFLARE_KV_NAMESPACE_ID` 和 `CLOUDFLARE_KV_API_KEY` —— 本项目是通过 Cloudflare 的 KV REST API
直接调用的(见 [`app/api/artifacts/route.ts`](../app/api/artifacts/route.ts)),因此无论应用本身
部署在 Cloudflare 还是其他地方,这个功能都能正常工作。请在同一个控制台的
**Storage & Databases → KV** 中创建 KV 命名空间,并在 **My Profile → API Tokens** 中创建一个具有
KV 编辑权限的 API token。

## 4. 值得了解的免费套餐限制

- **请求数**:Workers 免费套餐每天 100,000 次请求。每一轮聊天只消耗少量请求(一次页面加载 + 一次
  流式 API 调用),对个人或小团队使用来说相当宽裕。
- **CPU 时间**:按请求计费,但只统计实际执行的 JS 代码时间 —— 将上游 LLM API 的字节流式传回浏览器
  的等待时间不计入其中。
- **静态资源**:通过 `wrangler.jsonc` 中的 `assets` 绑定,直接从 Cloudflare 的边缘网络分发,不产生
  额外费用。
- 如果免费套餐不够用,Workers 付费套餐会取消每日请求上限,按请求数/CPU 毫秒计费,而不是像旧版
  "Pages Functions" 那样按固定档位收费。

## 5. 本地构建/预览(可选)

按照上面的控制台流程部署并不需要这一步,但如果你想在推送前先在本地测试 Cloudflare 构建:

```bash
yarn cf:build     # 先执行 yarn mask,再执行 next build + OpenNext 转换,输出到 .open-next/
yarn cf:preview   # 构建后通过 Wrangler 在本地运行该 Worker
```

`yarn cf:preview` 运行的是真实的 Worker 产物(而不是 `next dev`),所以它是在不实际部署的情况下,
最接近生产环境的一种本地演练方式。

## 6. 故障排查

- **构建日志出现 `Found wrangler.json file... did you mean to use wrangler.toml to configure
  Pages?`** —— 说明你把本仓库连接成了 **Pages** 项目,而不是 **Worker**。请删除该项目,并按第 2 节
  重新通过 **Compute (Workers) → Create → Import a Git repository** 创建;无论你怎么修改配置,
  Pages 都无法部署本仓库的 Worker+资源方案。
- **出现 `error yargs@...: The engine "node" is incompatible with this module` 之类的 EBADENGINE
  报错** —— 说明构建镜像解析到了一个过旧的 Node 版本(如果没有任何配置覆盖,Cloudflare Pages 默认会
  使用已停止维护的 `20.1.0`)。请移除旧版 Pages 指南遗留下来的 `NODE_VERSION=20.1` 变量;正常情况下
  仓库自带的 `.node-version`/`engines` 配置就足够了。如果构建系统仍然没有识别,可以显式设置
  `NODE_VERSION=22`。
- **同样的模型服务商请求本地正常,但在 Workers 上失败** —— 请检查构建日志中与 `nodejs_compat`
  相关的错误;这个标志已经在 `wrangler.jsonc` 中设置好了,但如果你重命名或移动了这个文件,
  Cloudflare 就不会读取到该标志。
- **`workers.dev` 网址正常,但自定义域名不行** —— 请在该 Worker 的 **Settings → Domains & Routes**
  标签页中添加域名;只要该域名的 DNS 托管在 Cloudflare,证书会自动签发。
