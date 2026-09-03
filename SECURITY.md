# Security Policy

## Reporting a vulnerability

Please **do not** open a public issue for security problems. Use GitHub's private vulnerability reporting ("Report a vulnerability" under the Security tab of the repository) or contact the maintainers directly. Include reproduction steps, the affected version/commit and, if possible, a proof of concept. You will receive an acknowledgement within a few days.

Supported: the latest release on the `main` branch.

## Threat model

FlareQR Studio is a stateless, self-hosted generator. The assets it protects are:

1. **The content users encode** – potentially secrets (OTP seeds, Wi-Fi passwords), personal data (contacts) or payment details.
2. **The deployment itself** – abuse of the API, or malicious uploads that could execute in a viewer's browser.

## Controls in place

### Data handling

- All generation in the web UI happens in the browser. Content never leaves the device unless the user explicitly calls the API (batch "Render via API" toggle or direct requests).
- The Worker logs `{method, path, status, ms}` only. No request bodies, payloads, tokens or headers are logged, and error responses never echo payload text.
- API responses carry `Cache-Control: no-store`; the service worker never caches `/api/*` or `/r/*`.
- Local history is opt-in, stored only in `localStorage`, clearly labelled as potentially sensitive, and clearable with one click. Presets never include logo image data.
- Built-in dynamic links store aggregate counters only – no IP addresses, user agents, referrers, cookies or fingerprints. With the Sink provider, link data lives in your Sink instance; this Worker only proxies admin operations and never stores the Sink token anywhere except the D1 settings row.

### Admin area

- Only the Admin page (settings, dynamic-link management, password) is protected; the generator and API stay public by design.
- The password is either the `ADMIN_PASSWORD` variable or a PBKDF2-SHA256 hash (25 000 iterations, 16-byte random salt) stored in D1 when the first visitor completes setup. Setup is only possible while no password exists; a race between two first visitors is guarded by a second existence check. Operators who want to avoid the first-visitor window set `ADMIN_PASSWORD` before sharing the URL.
- Sessions are stateless tokens (`base64url(payload).HMAC-SHA256`) with a 12-hour expiry, signed with a random 32-byte secret stored in D1 (or derived from `ADMIN_PASSWORD` when no database is bound). They are kept in the tab's `sessionStorage`, never in cookies, so CSRF does not apply.
- Login attempts are rate limited (10 per 10 minutes per client address, in isolate memory only). Comparisons use constant-time equality.
- Settings responses redact secrets (API token, Sink token) – the UI only learns whether one is set. Saving with an empty secret field keeps the stored value; clearing is explicit.
- Dynamic-link management requires an admin session unless the operator explicitly enables public access. Destinations must be `http(s)` URLs.

### Input validation

- Every API body is validated with strict Zod schemas (unknown keys rejected), limited to 1.6 MB, JSON only (`415` otherwise), read with a streaming size guard (`413`).
- Payloads are capped at 4000 characters and QR capacity is enforced (`422`).
- Output dimensions are constrained to 128–4096 px before any rendering happens; the raster ceiling is configurable via `MAX_RASTER_SIZE`.
- Colours must be hex; numbers are range-checked; filenames are sanitized (`Content-Disposition` uses an ASCII fallback plus RFC 5987 encoding) and the extension always matches the encoded format.

### Uploaded logos

- Allowed types: PNG, JPEG, WebP, SVG. The declared MIME type must match the sniffed file signature.
- Size limit 1 MB (raster logos are down-scaled client-side to ≤ 512 px first); SVG limit 512 KB.
- SVG is parsed with a strict, dependency-free XML parser (no entities, no DTD subsets, depth and node limits) and rebuilt from an **allowlist** of elements/attributes. Removed: `script`, `foreignObject`, `a`, `iframe`/`object`/`embed`, animation elements, `feImage`, all `on*` handlers, external `href`/`xlink:href`, `url()` references that are not local fragments, `@import`, `expression()`, `javascript:` and similar in inline styles/stylesheets.
- The Worker never fetches remote URLs for logos (no SSRF surface).
- The editor preview is an `<img>` pointing to an object URL, so even a hypothetical sanitizer bypass could not execute script in the app's origin.

### Generated SVG

- All user text (captions, titles) is XML-escaped; colours and numbers come from validated schemas; the only `href` values are validated `data:image/*;base64` URIs.
- Tests assert that generated SVG is well-formed XML and contains no `<script>`, external references or event handlers.

### HTTP hardening

- Static assets: `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; upgrade-insecure-requests` plus `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy`, `Cross-Origin-Opener-Policy: same-origin`, `X-Frame-Options: DENY`. Fingerprinted assets are `immutable`; HTML is `must-revalidate`.
- API responses: `default-src 'none'; frame-ancestors 'none'; sandbox`, `nosniff`, `no-referrer`, `Cross-Origin-Resource-Policy: same-origin` (or `cross-origin` only for allow-listed origins), `Cache-Control: no-store`.
- No inline scripts or styles anywhere (the theme bootstrap is an external script); no `eval`, `new Function`, `innerHTML` with user data or `javascript:` URLs (enforced by ESLint rules).
- CORS is off by default. `CORS_ALLOWED_ORIGINS` enables an explicit allowlist; `*` is never emitted. Preflights from unknown origins receive `403`.
- Optional bearer-token protection (`API_TOKEN`) with constant-time comparison. Requests that browsers mark as `Sec-Fetch-Site: same-origin` from the app's own origin are exempt so the bundled UI keeps working; this exemption is a convenience for the public UI (which renders locally anyway), not an authentication boundary – treat `API_TOKEN` as protection against automated third-party use.

### Supply chain

- `package-lock.json` is committed; `npm ci` installs exact versions.
- The D1 database is provisioned by Wrangler; the schema is created with idempotent `CREATE TABLE IF NOT EXISTS` statements at runtime, so no migration tooling runs with elevated privileges.
- Runtime dependencies are deliberately few: `react`, `react-dom`, `zod`, `zustand`, `lucide-react`, `fflate`, `@resvg/resvg-wasm`. The QR encoder and JPEG encoder are bundled source, not npm packages.
- Dependabot (`.github/dependabot.yml`) opens weekly update PRs for npm and GitHub Actions; CI runs `npm audit --omit=dev` and the full check suite.
- Nothing in the Worker depends on Node.js built-ins or native binaries; the only WebAssembly is resvg, loaded as a compiled module.

## Out of scope

- Denial of service through many legitimate requests (use Cloudflare rate limiting / WAF rules in front of the Worker).
- Security of destinations encoded in QR codes created by users.
