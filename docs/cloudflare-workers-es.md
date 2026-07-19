# Despliegue en Cloudflare Workers (plan gratuito)

> Esta guía reemplaza la antigua [guía de Cloudflare Pages](./cloudflare-pages-es.md), que
> dependía de `@cloudflare/next-on-pages`. Cloudflare ahora recomienda desplegar aplicaciones
> Next.js como un **Worker** (con recursos estáticos) construido por el
> [adaptador OpenNext para Cloudflare](https://opennext.js.org/cloudflare) en su lugar — es
> compatible con el runtime normal de Node.js (las rutas de API de esta app ya lo usan por
> defecto), así que no hay que reescribir nada para el runtime "Edge" que exigía el enfoque
> anterior.

NextChat encaja perfectamente en el plan gratuito de Cloudflare: cada ruta de API es un proxy
sin estado basado en fetch hacia un proveedor de modelos (sin acceso al sistema de archivos, sin
tareas en segundo plano, sin ISR/regeneración estática), que es exactamente para lo que están
hechos los Workers. Las respuestas de chat en streaming (SSE) también funcionan bien — el límite
de tiempo de CPU del plan gratuito de Workers solo cuenta el cómputo activo, no el tiempo de
espera de la respuesta de la API externa, así que una respuesta en streaming larga apenas
consume presupuesto diario de CPU.

Este repositorio ya contiene todo lo necesario para construir un Worker:

- [`wrangler.jsonc`](../wrangler.jsonc) — el nombre del Worker, la fecha/flags de compatibilidad,
  y el binding de recursos estáticos.
- [`open-next.config.ts`](../open-next.config.ts) — la configuración de build de OpenNext para
  Cloudflare.
- `yarn cf:build` / `yarn cf:preview` / `yarn cf:deploy` — scripts de package.json que envuelven
  las CLI de OpenNext + Wrangler, por si alguna vez quieres compilar/probar localmente.

Esta guía cubre el **primer despliegue hecho a mano desde el panel de Cloudflare**, así que todo
lo de abajo son clics en el portal, no comandos de CLI — Cloudflare ejecutará los comandos de
build/deploy por ti en cada push, una vez conectado a tu fork.

## 1. Requisitos previos

- Una cuenta de Cloudflare (el plan gratuito es suficiente).
- Tu fork de este repositorio ya subido a GitHub.
- Al menos una clave de API de un proveedor de modelos (p. ej. `OPENAI_API_KEY`,
  `ANTHROPIC_API_KEY`, ...).

## 2. Crear el Worker desde el panel

> **Esto debe crearse como un Worker, no como un proyecto de Pages.** Cloudflare Pages y
> Cloudflare Workers son dos productos distintos con dos pipelines de build distintos, aunque el
> panel los agrupe bajo una sola sección "Workers & Pages". El sistema de build de Pages solo
> entiende la configuración antigua estilo `pages_build_output_dir` y no sabe cómo ejecutar la
> configuración Worker+assets de `wrangler.jsonc` que usa este repositorio — si conectas este
> repo como un proyecto **Pages**, el build falla de inmediato con un error como *"Found
> wrangler.json file... did you mean to use wrangler.toml to configure Pages?"*, seguido de
> errores al instalar dependencias por una versión de Node antigua y sin soporte que Pages usa
> por defecto. Si en algún momento del flujo de abajo ves un encabezado o pestaña "Pages",
> retrocede y busca el punto de entrada de **Workers**.

1. Inicia sesión en [dash.cloudflare.com](https://dash.cloudflare.com).
2. En la barra lateral izquierda ve a **Compute (Workers)** (esta es una sección de nivel
   superior separada de "Workers & Pages → Pages").
3. Haz clic en **Create** → **Import a Git repository**.
4. Autoriza la app de GitHub de Cloudflare si se te solicita, y elige tu fork de NextChat.
5. **Project/Worker name**: usa el valor por defecto o elige el tuyo — pasará a formar parte de
   tu URL `<name>.<subdomain>.workers.dev`. Si lo cambias, actualiza también `name` en
   [`wrangler.jsonc`](../wrangler.jsonc) (o simplemente deja el valor por defecto `nextchat`).
6. **Build settings**:
   - **Build command**: ponlo en `yarn cf:build` (o `npm run cf:build`) — **no lo dejes como
     `yarn run build`/`next build`**. El preset de framework Next.js de Cloudflare autocompleta
     el script `build` normal, que solo ejecuta `next build` y nunca invoca la transformación de
     OpenNext, así que `.open-next/` nunca se genera. `wrangler deploy` falla entonces en el
     último paso con `ERROR Could not find compiled Open Next config, did you run the build
     command?`, aunque el build de Next.js en sí haya funcionado. Si ya creaste el Worker con el
     comando autocompletado, abre **Build → Build configuration** (icono de lápiz) y cámbialo
     ahí, luego reintenta el despliegue — no hace falta recrear todo el proyecto.
   - Deja el **Deploy command** en su valor por defecto (`npx wrangler deploy`) — Cloudflare lo
     detecta automáticamente desde `wrangler.jsonc`.
   - **No** necesitas configurar los compatibility flags manualmente en el panel como exigía la
     antigua guía de Pages — `nodejs_compat` y `global_fetch_strictly_public` ya están declarados
     en `wrangler.jsonc` y viajan con cada build.
   - **No configures una variable de entorno `NODE_VERSION`** a menos que el log de build muestre
     que se está usando una versión incorrecta. Este repo fija Node vía `.node-version`/`engines`
     (>=20.19), que las imágenes de build actuales deberían leer automáticamente. En particular,
     no reutilices `NODE_VERSION=20.1` de la antigua guía de Pages (ya obsoleta) — esa versión
     exacta está sin soporte (EOL) y es demasiado antigua para las herramientas actuales de este
     proyecto (solo `yargs` ya requiere Node ^20.19/^22.12/>=23).
7. **Environment variables**: haz clic en **Add variable** por cada una que necesites (ver la
   tabla de abajo). Marca las claves de API como **Secret**, no como texto plano. Como mínimo
   añade tu clave de proveedor, p. ej. `OPENAI_API_KEY`.
8. Haz clic en **Save and Deploy**. El primer build tarda un par de minutos; Cloudflare muestra el
   log de build en pantalla.
9. Una vez desplegado, abre la URL `*.workers.dev` que te da Cloudflare y confirma que la interfaz
   de chat carga y que un mensaje realmente hace un round-trip con tu proveedor de modelos.

A partir de ahora, cada push a tu rama de producción dispara automáticamente un nuevo
build+deploy — esa parte ya no es un paso manual.

## 3. Variables de entorno

Las mismas variables que en cualquier otro despliegue de NextChat — consulta
[`.env.template`](../.env.template) para la lista completa. Las más comunes:

| Variable | Requerida | Propósito |
| --- | --- | --- |
| `OPENAI_API_KEY` | se requiere una de las claves de proveedor | Acceso a OpenAI |
| `ANTHROPIC_API_KEY` / `GOOGLE_API_KEY` / `DEEPSEEK_API_KEY` / ... | no | Habilita otros proveedores |
| `CODE` | no | Contraseña(s) de acceso a la instancia desplegada, separadas por comas |
| `BASE_URL` | no | Sobrescribe la base URL del API compatible con OpenAI |
| `HIDE_USER_API_KEY` | no | Pon `1` para impedir que los visitantes usen su propia clave |
| `ENABLE_MCP` | no | Pon `true` para habilitar el uso de herramientas MCP |
| `WHITE_WEBDAV_ENDPOINTS` | no | Lista blanca de hosts WebDAV para sincronizar el historial de chat |

Si quieres la función de "compartir como enlace" (Artifacts), configura también
`CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_KV_NAMESPACE_ID` y `CLOUDFLARE_KV_API_KEY` — esta app habla
directamente con la API REST de KV de Cloudflare (ver
[`app/api/artifacts/route.ts`](../app/api/artifacts/route.ts)), así que funciona igual sin
importar si la propia app corre en Cloudflare o en otro lugar. Crea el namespace de KV en
**Storage & Databases → KV** en el mismo panel, y un token de API con permiso de edición de KV en
**My Profile → API Tokens**.

## 4. Límites del plan gratuito que conviene conocer

- **Peticiones**: 100.000 peticiones/día en el plan gratuito de Workers. Cada turno de chat
  consume un número pequeño de peticiones (carga de página + una llamada de API en streaming),
  así que es más que suficiente para uso personal o de un equipo pequeño.
- **Tiempo de CPU**: limitado por petición, pero solo cuenta la ejecución activa de JS — el
  tiempo transmitiendo bytes desde la API del proveedor hasta el navegador no cuenta.
- **Recursos estáticos**: se sirven directamente desde la red edge de Cloudflare mediante el
  binding `assets` en `wrangler.jsonc`, sin coste adicional.
- Si superas el plan gratuito, el plan de pago de Workers elimina el límite diario de peticiones
  y se factura por petición/CPU-ms, en lugar del modelo de nivel fijo tipo "Pages Functions".

## 5. Build/preview local (opcional)

No lo necesitas para el flujo desde el panel de arriba, pero si quieres probar el build de
Cloudflare localmente antes de hacer push:

```bash
yarn cf:build     # yarn mask, luego next build + la transformación de OpenNext hacia .open-next/
yarn cf:preview   # compila y luego ejecuta el Worker localmente vía Wrangler
```

`yarn cf:preview` ejecuta el paquete real del Worker (no `next dev`), así que es lo más parecido
a un ensayo de producción que puedes tener sin desplegar de verdad.

## 6. Solución de problemas

- **El deploy falla con `ERROR Could not find compiled Open Next config, did you run the build
  command?` justo después de un build que parecía haber terminado bien** — el **Build command**
  está puesto como el `yarn run build`/`next build` normal en lugar de `yarn cf:build`.
  Corrígelo en **Build → Build configuration** en la configuración del Worker y reintenta el
  despliegue; ver la nota en la sección 2 de arriba.
- **El log de build dice `Found wrangler.json file... did you mean to use wrangler.toml to
  configure Pages?`** — conectaste este repo como un proyecto **Pages** en lugar de un
  **Worker**. Borra ese proyecto y repite la sección 2 usando **Compute (Workers) → Create →
  Import a Git repository**; Pages no puede desplegar la configuración Worker+assets de este
  repo sin importar qué configuración añadas.
- **Errores tipo `error yargs@...: The engine "node" is incompatible with this module` o
  EBADENGINE similares** — la imagen de build resolvió una versión antigua de Node (Cloudflare
  Pages usa por defecto `20.1.0`, sin soporte, si nada la sobrescribe). Elimina cualquier variable
  `NODE_VERSION=20.1` que quede de la antigua guía de Pages; los campos `.node-version`/`engines`
  del repo deberían bastar. Si el sistema de build sigue sin detectarlo, configura explícitamente
  `NODE_VERSION=22`.
- **Una petición a un proveedor funciona en local pero falla solo en Workers** — revisa el log de
  build buscando errores relacionados con `nodejs_compat`; ya está configurado en
  `wrangler.jsonc`, pero si renombraste o moviste ese archivo, Cloudflare no detectará el flag.
- **La URL `workers.dev` funciona pero un dominio personalizado no** — añade el dominio en la
  pestaña **Settings → Domains & Routes** del Worker; Cloudflare emite el certificado
  automáticamente en cuanto el DNS del dominio esté en Cloudflare.
