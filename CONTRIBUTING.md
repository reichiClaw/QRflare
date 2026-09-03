# Contributing

Thanks for your interest in EdgeQR Studio. This document explains how to set up a development environment, the project conventions and what a good pull request looks like.

## Development setup

```bash
git clone https://github.com/reichiClaw/QRflare.git
cd QRflare
npm ci
npx playwright install chromium   # only for browser tests
npm run dev
```

`npm run dev` starts Vite with the Cloudflare plugin, so the Worker API runs in workerd next to the React app on http://localhost:5173.

## Project layout

- `src/shared` – runtime-agnostic core (encoder, content types, renderer, security, pipeline). **Must not** import DOM, Canvas or Node APIs; it runs in the browser, in Web Workers, in Cloudflare Workers and in Node tests.
- `src/worker` – Cloudflare Worker (routing, API handlers, rasterization, optional dynamic module).
- `src/app` – React frontend.
- `tests/unit` – Vitest in Node (including round-trip decoding with ZXing and jsQR).
- `tests/workers` – Vitest inside workerd via `@cloudflare/vitest-pool-workers`.
- `tests/e2e` – Playwright.

## Conventions

- TypeScript strict mode with `noUncheckedIndexedAccess`; avoid `any` and type assertions unless unavoidable.
- Validation lives in Zod schemas that are shared by the UI and the API. Never validate in only one place.
- Styling never changes which modules are dark. If you add a module or finder shape, the round-trip tests must still decode.
- Security-sensitive changes (sanitizer, filenames, headers, CORS, auth) need tests that demonstrate the rejected input.
- Do not add dependencies that rely on Node built-ins, native binaries, a filesystem or a DOM at runtime in `src/shared` or `src/worker`.
- Keep the UI accessible: every control needs a label, keyboard access and a visible focus state; do not convey state with colour alone.
- Formatting is enforced by Prettier and linting by ESLint (`npm run format`, `npm run lint`).

## Before opening a pull request

```bash
npm run check          # typecheck + lint + format check + unit/worker tests + build
npm run test:browser   # Playwright (desktop + mobile)
```

Please:

1. Describe the change and the motivation.
2. Add or update tests (unit for shared code, workerd tests for API behaviour, Playwright for UI flows).
3. Update `README.md`, `public/openapi.yaml` and `CHANGELOG.md` when behaviour or the API changes.
4. Keep pull requests focused; unrelated refactors make review harder.

## Adding a content type

See [`docs/adding-a-content-type.md`](docs/adding-a-content-type.md).

## Adding a preset

Append to `BUILT_IN_PRESETS` in `src/shared/style/presets.ts`. Every built-in preset is decoded in `tests/unit/roundtrip.test.ts`, so a preset that hurts scannability will fail CI.

## Reporting security issues

See [SECURITY.md](SECURITY.md). Please do not file public issues for vulnerabilities.

## License

By contributing you agree that your contributions are licensed under the MIT License.
