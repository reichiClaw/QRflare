# EdgeQR Studio

**A self-hosted, privacy-first QR code studio that runs entirely on Cloudflare Workers.**
Design richly styled, standards-compliant QR codes for 20 content types, export them as SVG, PNG or JPG, generate hundreds at once from a CSV, and automate everything through a documented HTTP API – all from a single Worker deployment with no database, no account IDs and no third-party services.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/reichiClaw/QRflare)

> The button clones this repository into your GitHub/GitLab account and deploys it with Cloudflare Workers Builds. No API tokens, account IDs or manual resource creation are needed. See [Deploying](#deploying-to-cloudflare) for details.

<p align="center">
  <img src="docs/screenshots/desktop-light.png" alt="EdgeQR Studio desktop light theme" width="49%" />
  <img src="docs/screenshots/desktop-dark.png" alt="EdgeQR Studio desktop dark theme" width="49%" />
</p>
<p align="center">
  <img src="docs/screenshots/mobile-content.png" alt="Mobile content editor" width="24%" />
  <img src="docs/screenshots/mobile-design.png" alt="Mobile design tab" width="24%" />
  <img src="docs/screenshots/mobile-export.png" alt="Mobile export tab" width="24%" />
</p>

---

## Table of contents

- [Features](#features)
- [Privacy model](#privacy-model)
- [Supported content types](#supported-content-types)
- [Output formats](#output-formats)
- [Local development](#local-development)
- [Deploying to Cloudflare](#deploying-to-cloudflare)
- [Custom domain](#custom-domain)
- [HTTP API](#http-api)
- [Batch generation (CSV)](#batch-generation-csv)
- [Configuration reference](#configuration-reference)
- [Optional: dynamic QR codes](#optional-dynamic-qr-codes)
- [Security](#security)
- [Browser compatibility](#browser-compatibility)
- [Troubleshooting](#troubleshooting)
- [Customising](#customising)
- [Updating dependencies](#updating-dependencies)
- [Architecture](#architecture)
- [License](#license)

## Features

**Encoding**

- QR Code Model 2, versions 1–40, error correction L/M/Q/H, automatic or manual version and mask selection.
- Numeric, alphanumeric and byte (UTF-8) modes with automatic segmentation; full Unicode and emoji support.
- Capacity validation with clear messages; deterministic output; quiet zone of 4 modules by default.
- Powered by the [Project Nayuki](https://www.nayuki.io/page/qr-code-generator-library) reference encoder (MIT).

**Design**

- Module styles: square, rounded, dots, extra-rounded, diamond, classy, classy-rounded, and a safe custom style (corner radius + connected modules) that never alters the matrix.
- Finder-pattern frames (square, rounded, extra-rounded, circle, dots) and centers (square, rounded, circle, diamond).
- Foreground/background colours (hex, RGB or visual picker), transparent background, separate finder colours, linear/radial gradients with up to six stops.
- Logo upload (PNG, JPG, WebP, sanitized SVG) with scale, padding, corner radius, backplate and module clearing. Logos never cover finder patterns.
- Layout: module scale, quiet zone, padding, border, frame band, caption with font size/weight/alignment/spacing.
- Nine built-in presets plus local custom presets (save, rename, delete, import/export JSON, restore defaults).

**Quality & safety**

- A **Scan reliability** panel reports version, matrix size, error correction, bytes, remaining capacity, quiet zone, contrast and an overall status (Excellent / Good / Risky / Invalid), with actionable warnings for low contrast, inverted colours, transparency, tiny modules, oversized logos, low EC with a logo, complex gradients, mismatched finder colours and near-capacity payloads.
- One-click **Safe defaults**. Invalid codes can never be exported.

**Export**

- SVG (true vector, self-contained, embedded logo), PNG (128–4096 px, transparency) and JPG (adjustable quality, transparency flattened onto a chosen colour).
- Copy PNG to clipboard, copy SVG source, copy data URL, copy payload, sanitized file names whose extension always matches the real encoding.
- Batch mode: CSV import, row-level validation with inline fixes, chunked generation in a Web Worker, cancellation, ZIP download with optional `manifest.json`.

**Platform**

- React 19 + TypeScript (strict) + Vite 8 + Tailwind CSS 4 frontend, served as Cloudflare Static Assets.
- TypeScript Worker API with real server-side rasterization (resvg WebAssembly + a pure TypeScript JPEG encoder).
- Installable PWA with offline support for the static generator (API responses are never cached).
- Dark, light and system themes; keyboard accessible; WCAG 2.2 AA targets; reduced-motion aware.

## Privacy model

- **Generation is local.** The editor validates, encodes and renders every QR code in your browser. Nothing you type is sent anywhere, and the UI says so explicitly.
- **The API is opt-in.** Only two actions transmit content to _your_ Worker: the "Render raster files via API" toggle in batch mode and any request you send to `/api/v1/*` yourself. The UI never labels these as local.
- **No logging of payloads.** The Worker logs method, path, status and duration – never bodies, payloads, secrets or tokens. Error responses never echo payloads.
- **No third parties.** No analytics, tracking pixels, external fonts, CDNs or cookies. The Content Security Policy blocks any accidental external request.
- **History is off by default.** The optional local history stores full designs (including content) in `localStorage` only after you enable it, warns that it may contain sensitive data, and can be cleared instantly.
- **Sensitive content types** (OTP secrets, Wi-Fi passwords, contacts, payments) are flagged in the UI and treated identically – never stored automatically, never logged.

## Supported content types

| Type               | Payload format                                       | Notes                                                                                      |
| ------------------ | ---------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Plain text         | raw text                                             | Live character and byte counter, Unicode/emoji                                             |
| Website URL        | `https://…`                                          | Automatic `https://`, custom schemes preserved                                             |
| Email              | `mailto:` (RFC 6068)                                 | To/CC/BCC/subject/body                                                                     |
| Telephone          | `tel:` (RFC 3966)                                    | International normalization                                                                |
| SMS                | `sms:number?body=` (RFC 5724)                        |                                                                                            |
| WhatsApp           | `https://wa.me/…?text=`                              | Official click-to-chat link                                                                |
| Wi-Fi              | `WIFI:T:…;S:…;P:…;H:…;;`                             | WPA/WPA2/WPA3, WEP, open, hidden; special characters escaped; hex-only values quoted       |
| vCard              | vCard 3.0 / 4.0 (RFC 6350)                           | Multiple phones/emails, address, birthday, notes, optional tiny photo when capacity allows |
| MeCard             | `MECARD:…;;`                                         |                                                                                            |
| Calendar event     | iCalendar `VCALENDAR`/`VEVENT` (RFC 5545)            | All-day, time zones (converted to UTC), location, description, URL                         |
| Location           | `geo:lat,lng?q=…` (RFC 5870)                         | Optional label                                                                             |
| SEPA / EPC payment | EPC069-12 (`BCD`/`002`/`SCT`)                        | IBAN mod-97 validation, BIC, amount, purpose, structured or unstructured reference         |
| Bitcoin            | BIP-21 `bitcoin:`                                    | Amount, label, message                                                                     |
| Ethereum           | EIP-681 `ethereum:`                                  | ETH value in wei, chain ID, ERC-20 `transfer` calls                                        |
| OTP Auth (2FA)     | `otpauth://totp` / `otpauth://hotp`                  | Secret validated as base32, never logged or stored                                         |
| Social profile     | canonical profile URL                                | LinkedIn, Instagram, Facebook, X, YouTube, TikTok, Telegram, Signal, GitHub, custom        |
| App link           | App Store / Google Play / deep link / universal link | Package names expand to Play Store URLs                                                    |
| Custom URI         | scheme + authority + path + query                    | Builder or raw mode                                                                        |
| JSON               | validated (optionally minified) JSON                 | Never executed                                                                             |
| Raw payload        | exactly what you type                                | Expert mode                                                                                |

Every editor shows the exact encoded text in the collapsible **Raw payload** panel.

## Output formats

| Format | MIME            | Extension | Sizes           | Transparency                         | Where it is rendered                                            |
| ------ | --------------- | --------- | --------------- | ------------------------------------ | --------------------------------------------------------------- |
| SVG    | `image/svg+xml` | `.svg`    | resolution-free | yes                                  | Shared TypeScript renderer (browser and Worker)                 |
| PNG    | `image/png`     | `.png`    | 128–4096 px     | yes                                  | Browser: `<canvas>`; Worker: resvg (WebAssembly)                |
| JPG    | `image/jpeg`    | `.jpg`    | 128–4096 px     | flattened onto a configurable colour | Browser: `<canvas>`; Worker: resvg + bundled TypeScript encoder |

File signatures, MIME types and extensions are verified in the test suite (`tests/unit/raster-and-schema.test.ts`, `tests/workers/api.test.ts`, `tests/e2e/studio.spec.ts`).

## Local development

Requirements: Node.js ≥ 20.19 and npm.

```bash
npm ci                # install exactly the locked dependencies
npm run dev           # Vite dev server + Worker API in the Cloudflare local runtime (workerd)
```

Open http://localhost:5173. The Worker API is served on the same origin (`/api/*`).

Other scripts:

| Script                 | What it does                                                                                       |
| ---------------------- | -------------------------------------------------------------------------------------------------- |
| `npm run build`        | Production build → `dist/client` (static assets) and `dist/worker` (Worker bundle + wrangler.json) |
| `npm run preview`      | Serves the production build locally                                                                |
| `npm run typecheck`    | TypeScript for the app, Worker and Node tooling projects                                           |
| `npm run lint`         | ESLint (type-aware)                                                                                |
| `npm run format`       | Prettier                                                                                           |
| `npm test`             | Vitest: unit + round-trip tests (Node) and API tests inside workerd                                |
| `npm run test:browser` | Playwright: builds, serves through `wrangler dev` and runs desktop + mobile browser tests          |
| `npm run check`        | typecheck + lint + format check + tests + production build                                         |
| `npm run deploy`       | Build and deploy with Wrangler                                                                     |
| `npm run icons`        | Regenerate PNG icons from `public/icons/icon.svg`                                                  |

Before the first `npm run test:browser` install a browser: `npx playwright install chromium`.

## Deploying to Cloudflare

### One click

Click the **Deploy to Cloudflare** button at the top. Cloudflare will:

1. Fork/clone this repository into your GitHub or GitLab account.
2. Create a Worker named `edgeqr-studio` connected to that repository (Workers Builds).
3. Run the build and deploy commands below on every push.

Build command: `npm run build` · Deploy command: `npx wrangler deploy` · Root directory: `/`

Nothing in `wrangler.jsonc` needs to change. The Worker is served on `https://edgeqr-studio.<your-subdomain>.workers.dev`.

### From your machine

```bash
npm ci
npx wrangler login     # once
npm run deploy         # = npm run build && wrangler deploy
```

`wrangler.jsonc` contains no `account_id`, `zone_id`, routes, bindings, secrets or placeholder IDs. Wrangler resolves your account from the login.

### What gets deployed

- `dist/client/*` as **Static Assets** with SPA fallback and a `_headers` file (CSP, caching).
- `dist/worker/index.js` as the Worker, which runs only for `/api/*` and `/r/*` (`run_worker_first`).
- The resvg WebAssembly module (~1 MB compressed) and four subset Inter fonts (~0.35 MB compressed) for server-side captions – well within the 3 MB free-plan limit.

> **Free plan note:** Workers on the Free plan have a 10 ms CPU limit per request. SVG generation and small PNG/JPEG renders fit comfortably; very large raster renders (2048–4096 px) may exceed it and return an error. The browser editor is unaffected because it renders locally. Paid plans (30 s CPU) render every size.

## Custom domain

A custom domain is optional. To add one after deployment:

1. Add the domain/zone to your Cloudflare account.
2. In the Cloudflare dashboard open **Workers & Pages → edgeqr-studio → Settings → Domains & Routes → Add → Custom domain**, or add to `wrangler.jsonc`:

   ```jsonc
   "routes": [{ "pattern": "qr.example.com", "custom_domain": true }]
   ```

3. Redeploy (`npm run deploy`).

If you also want to disable the `workers.dev` URL, set `"workers_dev": false` in `wrangler.jsonc`.

## HTTP API

The API is versioned (`/api/v1`), validated with JSON Schema, documented in [`public/openapi.yaml`](public/openapi.yaml) (served at `/openapi.yaml`) and uses the same pipeline as the editor.

| Method | Path               | Purpose                                                            |
| ------ | ------------------ | ------------------------------------------------------------------ |
| GET    | `/api/health`      | Version, build info, enabled features and limits (no secrets)      |
| GET    | `/api/v1/schema`   | JSON Schema (draft 2020-12) of the request body + OpenAPI pointer  |
| POST   | `/api/v1/validate` | Validate content and settings; returns payload, capacity, warnings |
| POST   | `/api/v1/generate` | Returns SVG, PNG or JPEG bytes with `Content-Disposition`          |

Request body (all fields except `content` optional):

```json
{
  "content": { "type": "url", "value": { "url": "https://example.com" } },
  "qr": { "errorCorrection": "H", "version": "auto", "marginModules": 4 },
  "style": {
    "moduleShape": "rounded",
    "foreground": "#082F49",
    "background": "#FFFFFF",
    "gradient": {
      "enabled": true,
      "type": "linear",
      "angle": 45,
      "stops": [
        { "offset": 0, "color": "#2563EB" },
        { "offset": 1, "color": "#14B8A6" }
      ]
    }
  },
  "output": { "format": "png", "size": 1024, "jpegQuality": 90, "filename": "example-qr" }
}
```

### curl examples

```bash
BASE=https://edgeqr-studio.YOUR-SUBDOMAIN.workers.dev

# Health
curl -s $BASE/api/health | jq

# Validate a Wi-Fi code and inspect warnings
curl -s -X POST $BASE/api/v1/validate \
  -H 'Content-Type: application/json' \
  -d '{"content":{"type":"wifi","value":{"ssid":"Cafe Guest","password":"latte;art","encryption":"WPA"}}}' | jq

# PNG, 1024 px, rounded modules with a gradient
curl -X POST $BASE/api/v1/generate \
  -H 'Content-Type: application/json' \
  -d '{"content":{"type":"url","value":{"url":"https://example.com"}},"qr":{"errorCorrection":"H"},"style":{"moduleShape":"rounded","gradient":{"enabled":true,"stops":[{"offset":0,"color":"#2563EB"},{"offset":1,"color":"#14B8A6"}]}},"output":{"format":"png","size":1024,"filename":"example-qr"}}' \
  --output example-qr.png

# SVG with a frame and caption
curl -X POST $BASE/api/v1/generate \
  -H 'Content-Type: application/json' \
  -d '{"content":{"type":"url","value":{"url":"https://example.com/menu"}},"style":{"layout":{"frame":{"enabled":true,"color":"#2563EB"},"caption":{"enabled":true,"text":"Scan for the menu","color":"#FFFFFF"}}},"output":{"format":"svg","filename":"menu"}}' \
  --output menu.svg

# JPEG with transparency flattened onto light grey
curl -X POST $BASE/api/v1/generate \
  -H 'Content-Type: application/json' \
  -d '{"content":{"type":"text","value":{"text":"Hello"}},"style":{"transparentBackground":true},"output":{"format":"jpeg","size":600,"jpegQuality":85,"jpegBackground":"#F8FAFC"}}' \
  --output hello.jpg

# With a bearer token (only when API_TOKEN is configured)
curl -X POST $BASE/api/v1/generate -H "Authorization: Bearer $API_TOKEN" -H 'Content-Type: application/json' -d @examples/api/vcard.json --output ada.svg
```

More request bodies live in [`examples/api/`](examples/api/). Errors always use the same shape:

```json
{
  "error": {
    "code": "VALIDATION",
    "message": "The request is invalid.",
    "issues": [{ "path": "output.format", "message": "…" }]
  }
}
```

Status codes: `400` validation/logo/dimension errors, `401` missing token, `413` body too large, `415` not JSON, `422` payload exceeds QR capacity, `404`/`405` routing.

Response headers on generated images: `Content-Type` (real MIME), `Content-Disposition` (sanitized name, `?disposition=inline` to display), `Cache-Control: no-store`, `X-QR-Version`, `X-QR-Error-Correction`, `X-QR-Reliability`.

## Batch generation (CSV)

Open **Batch**, drop a CSV (or download the template). Reserved columns:

| Column            | Meaning                                                                         |
| ----------------- | ------------------------------------------------------------------------------- |
| `name`            | File name (sanitized; duplicates get `-2`, `-3`, …)                             |
| `type`            | Content type id (`url`, `wifi`, `vcard`, …); defaults to the selected default   |
| `format`          | `png`, `jpeg`/`jpg` or `svg`                                                    |
| `size`            | Width in pixels (128–4096)                                                      |
| `preset`          | Name or id of a built-in or custom preset                                       |
| `errorCorrection` | `L`, `M`, `Q` or `H`                                                            |
| `data`            | Shortcut for the primary field of the type (`url`, `text`, `number`, `ssid`, …) |

Any other column is written into the content value (`ssid`, `password`, `firstName`, `phone`, `email`, …). Example ([`examples/batch-example.csv`](examples/batch-example.csv)):

```csv
name,type,format,size,preset,data,ssid,password,encryption,firstName,lastName,phone,email,organization
website,url,png,1024,Electric blue & teal,https://example.com,,,,,,,,
guest-wifi,wifi,png,1024,Classic black & white,,Cafe Guest,latte;art,WPA,,,,,
ada,vcard,jpeg,1024,Rounded blue,,,,,Ada,Lovelace,+44 20 7946 0958,ada@example.com,Analytical Engines Ltd
```

Invalid rows are highlighted with the exact problem and can be edited inline. Generation runs in chunks (encoding in a Web Worker, rasterization on the main thread between frames), shows progress, can be cancelled, and produces a ZIP with an optional `manifest.json`. The default limit is 250 codes per batch (Settings). CSV contents stay in the browser unless you switch on **Render raster files via API**.

## Configuration reference

All configuration is optional. Variables are set in `wrangler.jsonc` (`vars`) or the Cloudflare dashboard; secrets with `npx wrangler secret put NAME`.

| Variable                       | Default         | Description                                                                                                                                           |
| ------------------------------ | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `APP_NAME`                     | `EdgeQR Studio` | Name reported by `/api/health`.                                                                                                                       |
| `CORS_ALLOWED_ORIGINS`         | _(empty)_       | Comma-separated origins allowed to call the API cross-origin. Empty = same-origin only; no wildcard is ever emitted.                                  |
| `API_TOKEN` (secret)           | _(unset)_       | When set, `/api/v1/*` requires `Authorization: Bearer <token>`. Same-origin requests from the bundled UI are exempt (see [SECURITY.md](SECURITY.md)). |
| `MAX_RASTER_SIZE`              | `4096`          | Maximum PNG/JPEG width the API renders.                                                                                                               |
| `DYNAMIC_QR_ENABLED`           | `false`         | Enables the optional dynamic module (requires the `DYNAMIC_DB` D1 binding).                                                                           |
| `DYNAMIC_ADMIN_TOKEN` (secret) | _(unset)_       | Admin token for the dynamic module's API.                                                                                                             |

Local overrides for development go in `.dev.vars` (git-ignored; see `.dev.vars.example`).

Client-side settings (theme, history opt-in, batch limit, raw-payload panel) live in the browser only.

## Optional: dynamic QR codes

Static codes need no infrastructure. If you want **editable short links** (`/r/<code>` redirects whose destination can change after printing, with expiry, enable/disable, scan limits and privacy-preserving aggregate counters), enable the D1-backed module described in [`docs/dynamic-qr.md`](docs/dynamic-qr.md):

```bash
npx wrangler d1 create edgeqr-dynamic          # copy the database_id into wrangler.jsonc (see wrangler.dynamic.example.jsonc)
npx wrangler secret put DYNAMIC_ADMIN_TOKEN
npm run deploy:dynamic                         # applies migrations via the binding, then deploys
```

The module stores **no IP addresses, user agents, referrers or cookies** – only per-link totals and per-day counts. When disabled (the default) the entire static generator, all export formats and the API work exactly the same.

## Security

Highlights (full details and reporting instructions in [SECURITY.md](SECURITY.md)):

- Strict Zod validation on every request; unknown fields rejected; body limit 1.6 MB; payload limit 4000 characters; output 128–4096 px.
- Logos: MIME allowlist, magic-byte verification, 1 MB limit, and an allowlist-based SVG sanitizer (own strict XML parser) that removes scripts, event handlers, `foreignObject`, external references, `@import`, entities and DTD subsets. The Worker never fetches remote logos.
- Generated SVG escapes all user text and embeds only validated `data:` URIs.
- Strict CSP (`default-src 'self'`, no inline scripts/styles), `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy`, `frame-ancestors 'none'`, `Cross-Origin-Opener-Policy`, immutable caching for fingerprinted assets, `no-store` for API responses.
- No `eval`, no `innerHTML` for user content (the preview is an `<img>` of an object URL), no cookies, no third-party requests.
- Dependencies audited with `npm audit` and kept current by Dependabot (`.github/dependabot.yml`).

## Browser compatibility

Tested with Chromium (desktop + mobile emulation) in CI. The app uses standard APIs available in current Chrome, Edge, Firefox and Safari: Canvas, Blob/Object URLs, Web Workers, `dialog`, `structuredClone`, Clipboard API (image copy requires Chromium or Safari 13.1+; a clear message is shown otherwise), `createImageBitmap` (logo down-scaling). Service-worker offline support requires HTTPS or `localhost`.

## Troubleshooting

| Symptom                                                                        | Fix                                                                                                                                                 |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm install` fails with `Cannot read properties of null (reading 'edgesOut')` | Known npm 10 bug with nested peer dependencies. Use `npm ci` (uses the committed lockfile) or npm ≥ 11 (`npx npm@11 install`).                      |
| `This Worker requires compatibility date …` in tests                           | The pinned Miniflare/workerd is too old. Run `npm ci` – `package.json` overrides align them with Wrangler's workerd.                                |
| Large PNG/JPEG API requests return an error on the Free plan                   | 10 ms CPU limit. Use SVG, smaller sizes, render in the browser, or upgrade the plan.                                                                |
| "Copy PNG" is disabled                                                         | The browser does not support `ClipboardItem` for images (Firefox). Use Download or Copy data URL.                                                   |
| A scanner cannot read a styled code                                            | Check the **Scan reliability** panel and apply **Safe defaults**. Prefer error correction H with logos, dark-on-light colours, 4-module quiet zone. |
| `npm run test:browser` fails to start                                          | Install a browser: `npx playwright install chromium`. Port 4173 must be free.                                                                       |

## Customising

### Branding

Edit [`src/config/branding.ts`](src/config/branding.ts) (name, description, repository URL, colours, tagline) and replace `public/icons/icon.svg`, then run `npm run icons`. Update `public/manifest.webmanifest`, the `<title>`/meta tags in `index.html` and the Tailwind tokens in `src/app/styles/app.css` if you change colours.

### Adding a content type

See [`docs/adding-a-content-type.md`](docs/adding-a-content-type.md). In short: add a Zod schema (`src/shared/content/schemas.ts`), a builder (`src/shared/content/builders.ts`), registry metadata (`src/shared/content/registry.ts`), a form (`src/app/components/content/forms.tsx` + `ContentPanel.tsx`), a primary CSV column (`src/shared/batch/rows.ts`) and tests. The API, batch mode, docs and round-trip tests pick it up automatically.

### Adding a visual preset

Append an entry to `BUILT_IN_PRESETS` in [`src/shared/style/presets.ts`](src/shared/style/presets.ts). Presets are partial styles merged over the defaults, and every built-in preset is round-trip decoded in the test suite.

## Updating dependencies

```bash
npm outdated
npm update                 # respects semver ranges
npm audit --omit=dev       # runtime dependencies
npm run check              # typecheck, lint, tests, build
npm run test:browser
```

Dependabot opens weekly PRs for npm and GitHub Actions. When bumping `wrangler`, also bump `@cloudflare/vite-plugin`, `@cloudflare/vitest-pool-workers` and the `overrides` in `package.json` so all three share one workerd version, and consider moving `compatibility_date` forward (it must not exceed the date supported by the bundled workerd).

## Architecture

```
src/
├── config/branding.ts           central branding
├── shared/                      runtime-agnostic core (browser + Worker + tests)
│   ├── qr/                      Nayuki encoder (vendored ESM) + typed wrapper
│   ├── content/                 Zod schemas, payload builders, registry (20 types)
│   ├── style/                   style/output schemas, colour maths, presets
│   ├── render/svg.ts            matrix + style → self-contained SVG
│   ├── quality/reliability.ts   scan-reliability evaluation
│   ├── security/                XML parser, SVG sanitizer, data-URL & filename safety
│   ├── raster/                  pure TS JPEG encoder, file signatures
│   ├── batch/                   CSV parser, row → request mapping
│   ├── api/schemas.ts           API request/response schemas, JSON Schema
│   └── pipeline.ts              content → payload → matrix → SVG → report
├── worker/                      Cloudflare Worker (router, API, raster via resvg-wasm, dynamic module)
└── app/                         React UI (stores, hooks, components, batch Web Worker)
tests/
├── unit/                        builders, security, quality, raster/schema, round-trip (ZXing + jsQR)
├── workers/                     API + dynamic module tests inside workerd
└── e2e/                         Playwright desktop + mobile
```

The encoder produces a boolean matrix; the renderer turns it into SVG without touching module positions; the browser rasterizes the SVG with `<canvas>` and the Worker with resvg. Every output path is verified by decoding with an independent decoder (ZXing-C++ via WebAssembly, plus jsQR for classic styles).

## License

[MIT](LICENSE). Bundled third-party components: Nayuki QR Code generator (MIT), Inter font subset (SIL OFL 1.1, `src/worker/fonts/LICENSE-Inter.txt`), resvg (MPL-2.0, via `@resvg/resvg-wasm`), Lucide icons (ISC).
