# Cloudflare Workers へのデプロイ(無料プラン)

> このガイドは、`@cloudflare/next-on-pages` に依存していた従来の
> [Cloudflare Pages ガイド](./cloudflare-pages-ja.md) の後継です。Cloudflare は現在、Next.js
> アプリを [OpenNext Cloudflare アダプター](https://opennext.js.org/cloudflare) でビルドした
> **Worker**(静的アセット付き)としてデプロイすることを推奨しています —— これは通常の Node.js
> ランタイムをサポートしており(本アプリの API ルートはデフォルトでこのランタイムを使用しています)、
> 従来の方式で必要だった "Edge" ランタイム向けの書き換えは一切不要です。

NextChat は Cloudflare の無料プランに十分収まります。すべての API ルートはモデルプロバイダーへの
ステートレスな fetch ベースのプロキシであり(ファイルシステムへのアクセスなし、バックグラウンド
ジョブなし、ISR/静的再生成なし)、これはまさに Workers が得意とする用途です。ストリーミングの
チャット応答(SSE)も問題なく動作します —— Workers 無料プランの CPU 時間制限はアクティブな計算時間
のみをカウントし、上流 API からの応答待ち時間はカウントしないため、長時間のストリーミング応答でも
1 日あたりの CPU 時間予算はほとんど消費しません。

このリポジトリには、Worker をビルドするために必要なものがすでにすべて含まれています:

- [`wrangler.jsonc`](../wrangler.jsonc) —— Worker の名前、互換性の日付/フラグ、静的アセットの
  バインディング。
- [`open-next.config.ts`](../open-next.config.ts) —— OpenNext の Cloudflare ビルド設定。
- `yarn cf:build` / `yarn cf:preview` / `yarn cf:deploy` —— OpenNext + Wrangler の CLI を
  ラップした package.json のスクリプト(ローカルでビルド・テストしたい場合用)。

このガイドは **Cloudflare ダッシュボードから手動で行う初回デプロイ** のみを扱うため、以下はすべて
ポータル上でのクリック操作であり、CLI コマンドではありません —— fork をリポジトリに接続した後は、
Cloudflare がプッシュのたびにビルド/デプロイコマンドを自動的に実行します。

## 1. 前提条件

- Cloudflare アカウント(無料プランで十分です)。
- 本リポジトリの fork が GitHub にプッシュ済みであること。
- 少なくとも 1 つのモデルプロバイダーの API キー(例: `OPENAI_API_KEY`、`ANTHROPIC_API_KEY` など)。

## 2. ダッシュボードから Worker を作成する

> **これは Pages プロジェクトではなく、Worker として作成する必要があります。** Cloudflare Pages と
> Cloudflare Workers は、ダッシュボード上では同じ "Workers & Pages" セクションにまとめられていますが、
> ビルドパイプラインが異なる別々の製品です。Pages のビルドランナーは従来の
> `pages_build_output_dir` 形式の設定しか理解できず、このリポジトリが使用する `wrangler.jsonc` の
> Worker+アセット構成を実行する方法を知りません —— このリポジトリを **Pages** プロジェクトとして
> 接続すると、*"Found wrangler.json file... did you mean to use wrangler.toml to configure
> Pages?"* のようなエラーで即座にビルドが失敗し、続けて Pages がデフォルトで使用する古い、サポート
> 終了(EOL)済みの Node バージョンによる依存関係インストールエラーが発生します。以下の手順の途中で
> "Pages" という見出しやタブが表示された場合は、いったん戻って **Workers** の入り口を探してください。

1. [dash.cloudflare.com](https://dash.cloudflare.com) にログインします。
2. 左サイドバーの **Compute (Workers)** に移動します(これは "Workers & Pages → Pages" とは
   独立したトップレベルのセクションです)。
3. **Create** → **Import a Git repository** をクリックします。
4. 求められたら Cloudflare の GitHub アプリを認証し、フォークした NextChat リポジトリを選択します。
5. **Project/Worker name**: デフォルトのままでも、独自の名前でも構いません —— これは
   `<name>.<subdomain>.workers.dev` という URL の一部になります。名前を変更した場合は
   [`wrangler.jsonc`](../wrangler.jsonc) の `name` も合わせて変更してください(あるいはデフォルトの
   `nextchat` のままでも構いません)。
6. **Build settings(ビルド設定)**:
   - **Build command(ビルドコマンド)**: `yarn cf:build`(または `npm run cf:build`)に設定して
     ください —— **`yarn run build`/`next build` のままにしないでください**。Cloudflare の
     Next.js フレームワークプリセットは通常の `build` スクリプトを自動入力しますが、これは
     `next build` を実行するだけで OpenNext の変換を一切呼び出さないため、`.open-next/`
     が生成されません。その結果、Next.js のビルド自体は成功していても、最後のステップで
     `wrangler deploy` が `ERROR Could not find compiled Open Next config, did you run the build
     command?` というエラーで失敗します。すでに自動入力されたコマンドで Worker を作成して
     しまった場合は、**Build → Build configuration**(鉛筆アイコン)を開いてそこで変更し、
     デプロイをやり直してください —— プロジェクト全体を作り直す必要はありません。
   - **Deploy command(デプロイコマンド)** はデフォルト(`npx wrangler deploy`)のままにしてください
     —— Cloudflare が `wrangler.jsonc` から自動的に検出します。
   - 旧 Pages ガイドで必要だったように、ダッシュボードで互換性フラグを手動設定する**必要は
     ありません** —— `nodejs_compat` と `global_fetch_strictly_public` はすでに `wrangler.jsonc`
     に宣言済みで、ビルドのたびに自動的に反映されます。
   - **`NODE_VERSION` 環境変数は設定しないでください**。ビルドログで誤ったバージョンが使われている
     ことが確認できた場合のみ設定してください。このリポジトリはすでに `.node-version`/`engines`
     (>=20.19)で Node バージョンを固定しており、現在のビルドイメージであれば自動的に読み取られる
     はずです。特に、古い(廃止済みの)Pages ガイドにあった `NODE_VERSION=20.1` を流用しないで
     ください —— このバージョンはすでに EOL であり、本プロジェクトの現在のビルドツール(`yargs`
     だけでも Node ^20.19/^22.12/>=23 が必要)には古すぎます。
7. **Environment variables(環境変数)**: 必要な変数ごとに **Add variable** をクリックします
   (下の表を参照)。API キーは平文ではなく **Secret** としてマークしてください。最低限、
   `OPENAI_API_KEY` などプロバイダーのキーを 1 つは追加してください。
8. **Save and Deploy** をクリックします。最初のビルドには数分かかり、Cloudflare が画面上に
   ビルドログをストリーミング表示します。
9. デプロイが完了したら、Cloudflare が発行した `*.workers.dev` の URL を開き、チャット UI が
   読み込まれること、そして実際にメッセージがモデルプロバイダーとの間で往復することを確認します。

これ以降は、本番ブランチへのプッシュのたびに新しいビルド+デプロイが自動的にトリガーされます ——
この部分はもう手動作業ではありません。

## 3. 環境変数

他の NextChat デプロイと同じ変数です —— 完全な一覧は [`.env.template`](../.env.template)
を参照してください。よく使うものは以下の通りです:

| 変数 | 必須か | 用途 |
| --- | --- | --- |
| `OPENAI_API_KEY` | いずれかのプロバイダーキーが必須 | OpenAI へのアクセス |
| `ANTHROPIC_API_KEY` / `GOOGLE_API_KEY` / `DEEPSEEK_API_KEY` / ... | いいえ | 他のプロバイダーを有効化 |
| `CODE` | いいえ | デプロイしたインスタンスのアクセスパスワード(カンマ区切りで複数可) |
| `BASE_URL` | いいえ | 上流の OpenAI 互換 API のベース URL を上書き |
| `HIDE_USER_API_KEY` | いいえ | `1` に設定すると訪問者が自分の API キーを入力できなくなる |
| `ENABLE_MCP` | いいえ | `true` に設定すると MCP のツール呼び出しが有効になる |
| `WHITE_WEBDAV_ENDPOINTS` | いいえ | チャットログ同期を許可する WebDAV ホストのホワイトリスト |

「リンクとして共有」(Artifacts)機能を使いたい場合は、`CLOUDFLARE_ACCOUNT_ID`、
`CLOUDFLARE_KV_NAMESPACE_ID`、`CLOUDFLARE_KV_API_KEY` も設定してください —— 本アプリは
Cloudflare の KV REST API を直接呼び出しているため(
[`app/api/artifacts/route.ts`](../app/api/artifacts/route.ts) を参照)、アプリ自体が
Cloudflare 上で動いているかどうかに関係なく同じように動作します。同じダッシュボードの
**Storage & Databases → KV** で KV ネームスペースを作成し、**My Profile → API Tokens** で
KV 編集権限を持つ API トークンを作成してください。

## 4. 知っておくべき無料プランの制限

- **リクエスト数**: Workers 無料プランでは 1 日あたり 100,000 リクエストです。1 回のチャットの
  やり取りで消費するリクエスト数はわずか(ページ読み込み + ストリーミング API 呼び出し 1 回)なので、
  個人利用や小規模チームでの利用には十分な余裕があります。
- **CPU 時間**: リクエストごとに上限がありますが、カウントされるのはアクティブな JS 実行時間のみ
  です —— 上流の LLM API からのバイト列をブラウザにストリーミングして返す待ち時間はカウントされません。
- **静的アセット**: `wrangler.jsonc` の `assets` バインディングを通じて Cloudflare のエッジ
  ネットワークから直接配信され、追加費用はかかりません。
- 無料プランを超える場合、Workers の有料プランでは 1 日あたりのリクエスト上限が撤廃され、旧来の
  "Pages Functions" のような固定枠ではなく、リクエスト数/CPU ミリ秒単位での課金になります。

## 5. ローカルでのビルド/プレビュー(任意)

上記のダッシュボード主導のフローではこの手順は不要ですが、プッシュ前にローカルで Cloudflare の
ビルドをテストしたい場合は次のようにします:

```bash
yarn cf:build     # yarn mask を実行後、next build + OpenNext の変換を .open-next/ に出力
yarn cf:preview   # ビルド後、Wrangler 経由でローカルに Worker を実行
```

`yarn cf:preview` は(`next dev` ではなく)実際の Worker バンドルを実行するため、実際に
デプロイすることなく本番環境に最も近いリハーサルを行うことができます。

## 6. トラブルシューティング

- **一見成功したように見えるビルドの直後に、デプロイが `ERROR Could not find compiled Open
  Next config, did you run the build command?` で失敗する** —— **Build command** が
  `yarn cf:build` ではなく、通常の `yarn run build`/`next build` のままになっています。
  Worker の設定にある **Build → Build configuration** で修正し、デプロイをやり直してください。
  上記の第 2 節の注記も参照してください。
- **ビルドログに `Found wrangler.json file... did you mean to use wrangler.toml to configure
  Pages?` と表示される** —— このリポジトリを **Worker** ではなく **Pages** プロジェクトとして
  接続してしまっています。そのプロジェクトを削除し、**Compute (Workers) → Create → Import a
  Git repository** から第 2 節をやり直してください。どのような設定を追加しても、Pages は
  このリポジトリの Worker+アセット構成をデプロイできません。
- **`error yargs@...: The engine "node" is incompatible with this module` のような
  EBADENGINE エラーが出る** —— ビルドイメージが古い Node バージョンを解決してしまっています
  (何も上書きしない場合、Cloudflare Pages はデフォルトで EOL 済みの `20.1.0` を使用します)。
  旧 Pages ガイドから残っている `NODE_VERSION=20.1` の変数を削除してください。通常はリポジトリの
  `.node-version`/`engines` の設定だけで十分なはずです。それでもビルドシステムが認識しない場合は、
  明示的に `NODE_VERSION=22` を設定してください。
- **同じプロバイダーへのリクエストがローカルでは動くのに Workers 上でだけ失敗する** —— ビルド
  ログで `nodejs_compat` 関連のエラーがないか確認してください。このフラグはすでに
  `wrangler.jsonc` に設定済みですが、このファイルをリネームまたは移動した場合、Cloudflare は
  そのフラグを読み取れません。
- **`workers.dev` の URL は動くのにカスタムドメインが動かない** —— Worker の
  **Settings → Domains & Routes** タブでドメインを追加してください。ドメインの DNS が
  Cloudflare に置かれていれば、証明書は自動的に発行されます。
