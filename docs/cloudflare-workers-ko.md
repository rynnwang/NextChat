# Cloudflare Workers에 배포하기 (무료 플랜)

> 이 가이드는 `@cloudflare/next-on-pages`에 의존하던 기존
> [Cloudflare Pages 가이드](./cloudflare-pages-ko.md)를 대체합니다. Cloudflare는 이제 Next.js
> 앱을 [OpenNext Cloudflare 어댑터](https://opennext.js.org/cloudflare)로 빌드한 **Worker**
> (정적 자산 포함)로 배포하는 것을 권장합니다 —— 이 방식은 일반 Node.js 런타임을 지원하므로
> (이 앱의 API 라우트는 기본적으로 이 런타임을 사용합니다), 기존 방식에서 요구하던 "Edge" 런타임에
> 맞춰 코드를 다시 작성할 필요가 없습니다.

NextChat은 Cloudflare의 무료 플랜에 매우 잘 맞습니다. 모든 API 라우트는 모델 제공업체로의 상태
비저장(stateless) fetch 기반 프록시이며(파일 시스템 접근 없음, 백그라운드 작업 없음, ISR/정적
재생성 없음), 이는 정확히 Workers가 설계된 용도입니다. 스트리밍 채팅 응답(SSE)도 문제없이
동작합니다 —— Workers 무료 플랜의 CPU 시간 제한은 실제 연산에 사용된 시간만 계산하고 상위 API의
응답을 기다리는 시간은 계산하지 않으므로, 긴 스트리밍 응답이라도 하루 CPU 시간 예산을 거의
소모하지 않습니다.

이 저장소에는 Worker를 빌드하는 데 필요한 모든 것이 이미 포함되어 있습니다:

- [`wrangler.jsonc`](../wrangler.jsonc) —— Worker의 이름, 호환성 날짜/플래그, 정적 자산 바인딩.
- [`open-next.config.ts`](../open-next.config.ts) —— OpenNext의 Cloudflare 빌드 설정.
- `yarn cf:build` / `yarn cf:preview` / `yarn cf:deploy` —— OpenNext + Wrangler CLI를 감싼
  package.json 스크립트로, 로컬에서 빌드/테스트하고 싶을 때 사용합니다.

이 가이드는 **Cloudflare 대시보드에서 수동으로 진행하는 최초 배포**만 다루므로, 아래 내용은 모두
CLI 명령이 아닌 포털 클릭 작업입니다 —— fork를 연결한 이후에는 Cloudflare가 매 푸시마다 빌드/배포
명령을 자동으로 실행합니다.

## 1. 사전 준비물

- Cloudflare 계정(무료 플랜으로 충분합니다).
- GitHub에 푸시된 이 저장소의 fork.
- 최소 하나 이상의 모델 제공업체 API 키(예: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` 등).

## 2. 대시보드에서 Worker 생성하기

> **반드시 Pages 프로젝트가 아니라 Worker로 생성해야 합니다.** Cloudflare Pages와 Cloudflare
> Workers는 대시보드에서 하나의 "Workers & Pages" 섹션으로 묶여 있지만, 서로 다른 빌드
> 파이프라인을 가진 별개의 제품입니다. Pages의 빌드 러너는 예전 방식의
> `pages_build_output_dir` 설정만 이해하며, 이 저장소가 사용하는 `wrangler.jsonc`의
> Worker+자산 구성을 실행하는 방법을 모릅니다 —— 이 저장소를 **Pages** 프로젝트로 연결하면
> *"Found wrangler.json file... did you mean to use wrangler.toml to configure Pages?"*와
> 같은 오류로 빌드가 즉시 실패하고, 이어서 Pages가 기본으로 사용하는 오래되고 지원이 종료(EOL)된
> Node 버전으로 인한 의존성 설치 오류가 발생합니다. 아래 과정 중 어느 화면에서든 "Pages"라는
> 제목이나 탭이 보이면, 뒤로 나가서 **Workers** 진입점을 찾으세요.

1. [dash.cloudflare.com](https://dash.cloudflare.com)에 로그인합니다.
2. 왼쪽 사이드바에서 **Compute (Workers)**로 이동합니다("Workers & Pages → Pages"와는 별개의
   최상위 섹션입니다).
3. **Create** → **Import a Git repository**를 클릭합니다.
4. 요청 시 Cloudflare의 GitHub 앱을 승인한 다음, fork한 NextChat 저장소를 선택합니다.
5. **Project/Worker name**: 기본값을 사용하거나 직접 지정할 수 있습니다 —— 이 이름은
   `<name>.<subdomain>.workers.dev` URL의 일부가 됩니다. 이름을 바꾸는 경우
   [`wrangler.jsonc`](../wrangler.jsonc)의 `name` 값도 함께 수정하세요(또는 기본값인 `nextchat`을
   그대로 두어도 됩니다).
6. **Build settings(빌드 설정)**:
   - **Build command(빌드 명령어)**: `npm run cf:build` (이 저장소에는 `yarn.lock`이 포함되어
     있으므로, 패키지 매니저로 계속 Yarn을 사용한다면 `yarn cf:build`를 사용해도 됩니다 —— 둘 다
     동작합니다).
   - **Deploy command(배포 명령어)**는 기본값(`npx wrangler deploy`) 그대로 두세요 ——
     Cloudflare가 `wrangler.jsonc`에서 자동으로 감지합니다.
   - 기존 Pages 가이드에서 요구했던 것처럼 대시보드에서 호환성 플래그를 수동으로 설정할
     **필요가 없습니다** —— `nodejs_compat`과 `global_fetch_strictly_public`은 이미
     `wrangler.jsonc`에 선언되어 있어 모든 빌드에 자동으로 적용됩니다.
   - **`NODE_VERSION` 환경 변수는 설정하지 마세요**. 빌드 로그에서 잘못된 버전이 사용되고 있는
     것이 확인될 때만 설정하세요. 이 저장소는 이미 `.node-version`/`engines`(>=20.19)로 Node
     버전을 고정해두었으며, 현재의 빌드 이미지라면 이를 자동으로 인식해야 합니다. 특히, 오래되고
     폐기된 Pages 가이드에 있던 `NODE_VERSION=20.1`을 재사용하지 마세요 —— 이 버전은 이미 EOL
     상태이며, 이 프로젝트의 현재 빌드 도구(`yargs`만 해도 Node ^20.19/^22.12/>=23을 요구합니다)에는
     너무 오래된 버전입니다.
7. **Environment variables(환경 변수)**: 필요한 변수마다 **Add variable**을 클릭합니다(아래 표
   참고). API 키는 평문이 아니라 **Secret**으로 표시하세요. 최소한 `OPENAI_API_KEY`와 같은 제공업체
   키 하나는 추가해야 합니다.
8. **Save and Deploy**를 클릭합니다. 첫 빌드는 몇 분 정도 걸리며, Cloudflare가 화면에 빌드 로그를
   실시간으로 표시합니다.
9. 배포가 완료되면 Cloudflare가 제공하는 `*.workers.dev` URL을 열어 채팅 UI가 정상적으로
   로드되는지, 그리고 실제로 메시지가 모델 제공업체와 정상적으로 왕복하는지 확인합니다.

이제부터는 프로덕션 브랜치에 푸시할 때마다 새로운 빌드+배포가 자동으로 트리거됩니다 —— 이 부분은
더 이상 수동 작업이 아닙니다.

## 3. 환경 변수

다른 NextChat 배포와 동일한 변수를 사용합니다 —— 전체 목록은
[`.env.template`](../.env.template)을 참고하세요. 자주 사용하는 변수는 다음과 같습니다:

| 변수 | 필수 여부 | 용도 |
| --- | --- | --- |
| `OPENAI_API_KEY` | 제공업체 키 중 하나는 필수 | OpenAI 접근 |
| `ANTHROPIC_API_KEY` / `GOOGLE_API_KEY` / `DEEPSEEK_API_KEY` / ... | 아니오 | 다른 제공업체 활성화 |
| `CODE` | 아니오 | 배포된 인스턴스의 접근 비밀번호, 쉼표로 여러 개 구분 가능 |
| `BASE_URL` | 아니오 | 상위 OpenAI 호환 API의 base URL 재정의 |
| `HIDE_USER_API_KEY` | 아니오 | `1`로 설정하면 방문자가 자신의 API 키를 입력하지 못하도록 함 |
| `ENABLE_MCP` | 아니오 | `true`로 설정하면 MCP 도구 호출을 활성화함 |
| `WHITE_WEBDAV_ENDPOINTS` | 아니오 | 채팅 기록 동기화에 허용되는 WebDAV 호스트 화이트리스트 |

"링크로 공유"(Artifacts) 기능을 사용하려면 `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_KV_NAMESPACE_ID`,
`CLOUDFLARE_KV_API_KEY`도 설정하세요 —— 이 앱은 Cloudflare의 KV REST API를 직접 호출하므로(
[`app/api/artifacts/route.ts`](../app/api/artifacts/route.ts) 참고), 앱 자체가 Cloudflare에서
실행되든 다른 곳에서 실행되든 동일하게 동작합니다. 같은 대시보드의
**Storage & Databases → KV**에서 KV 네임스페이스를 생성하고, **My Profile → API Tokens**에서 KV
편집 권한이 있는 API 토큰을 생성하세요.

## 4. 알아두어야 할 무료 플랜 제한

- **요청 수**: Workers 무료 플랜은 하루 100,000 요청입니다. 채팅 한 턴은 소수의 요청만 소비하므로
  (페이지 로드 + 스트리밍 API 호출 1회), 개인 또는 소규모 팀 사용에는 충분히 여유롭습니다.
- **CPU 시간**: 요청당 제한이 있지만, 실제로 실행되는 JS 연산 시간만 계산됩니다 —— 상위 LLM API의
  바이트를 브라우저로 스트리밍하는 동안의 대기 시간은 포함되지 않습니다.
- **정적 자산**: `wrangler.jsonc`의 `assets` 바인딩을 통해 Cloudflare의 엣지 네트워크에서 직접
  제공되며, 추가 비용이 들지 않습니다.
- 무료 플랜을 초과하는 경우, Workers 유료 플랜은 일일 요청 상한을 없애고 기존의 고정 등급
  "Pages Functions" 방식이 아니라 요청 수/CPU-ms 단위로 과금합니다.

## 5. 로컬 빌드/미리보기(선택 사항)

위의 대시보드 중심 흐름에서는 이 단계가 필요 없지만, 푸시하기 전에 로컬에서 Cloudflare 빌드를
테스트하고 싶다면 다음과 같이 합니다:

```bash
yarn cf:build     # yarn mask 실행 후 next build + OpenNext 변환을 .open-next/에 출력
yarn cf:preview   # 빌드 후 Wrangler를 통해 로컬에서 Worker 실행
```

`yarn cf:preview`는 (`next dev`가 아니라) 실제 Worker 번들을 실행하므로, 실제로 배포하지 않고도
프로덕션과 가장 가까운 드라이런을 해볼 수 있습니다.

## 6. 문제 해결

- **빌드 로그에 `Found wrangler.json file... did you mean to use wrangler.toml to configure
  Pages?`라고 표시됨** —— 이 저장소를 **Worker**가 아니라 **Pages** 프로젝트로 연결한
  것입니다. 해당 프로젝트를 삭제하고 **Compute (Workers) → Create → Import a Git repository**를
  통해 2절을 다시 진행하세요. 어떤 설정을 추가하더라도 Pages는 이 저장소의 Worker+자산 구성을
  배포할 수 없습니다.
- **`error yargs@...: The engine "node" is incompatible with this module`와 같은 EBADENGINE
  오류가 발생함** —— 빌드 이미지가 오래된 Node 버전을 사용한 것입니다(아무것도 재정의하지 않으면
  Cloudflare Pages는 기본으로 EOL 상태인 `20.1.0`을 사용합니다). 기존 Pages 가이드에서 남은
  `NODE_VERSION=20.1` 변수를 제거하세요. 일반적으로는 저장소의 `.node-version`/`engines` 설정만으로
  충분합니다. 그래도 빌드 시스템이 이를 인식하지 못한다면 `NODE_VERSION=22`를 명시적으로
  설정하세요.
- **동일한 제공업체 요청이 로컬에서는 되는데 Workers에서만 실패함** —— 빌드 로그에서
  `nodejs_compat` 관련 오류가 있는지 확인하세요. 이 플래그는 이미 `wrangler.jsonc`에 설정되어
  있지만, 이 파일의 이름을 바꾸거나 옮겼다면 Cloudflare가 해당 플래그를 인식하지 못합니다.
- **`workers.dev` URL은 동작하는데 커스텀 도메인이 동작하지 않음** —— 해당 Worker의
  **Settings → Domains & Routes** 탭에서 도메인을 추가하세요. 도메인의 DNS가 Cloudflare에
  연결되어 있으면 인증서는 자동으로 발급됩니다.
