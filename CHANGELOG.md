# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [1.0.0] – 2026-09-03

### Added

- QR encoding engine based on the Project Nayuki reference implementation (versions 1–40, EC L/M/Q/H, automatic and manual version/mask selection, UTF-8 byte mode).
- 20 content types with Zod validation and standards-compliant payload builders: text, URL, email, telephone, SMS, WhatsApp, Wi-Fi, vCard 3.0/4.0, MeCard, iCalendar event, geo, SEPA/EPC, Bitcoin (BIP-21), Ethereum (EIP-681), OTP Auth, social profiles, app links, custom URI, JSON, raw payload.
- SVG renderer with 8 module styles, 5 finder frames, 4 finder centers, gradients, separate finder colours, logos with backplate, borders, frames, captions and padding.
- Scan-reliability panel with actionable warnings and "Safe defaults".
- Exports: SVG, PNG (128–4096 px), JPG with quality and flatten colour; clipboard and data-URL actions; sanitized filenames.
- Batch generation from CSV with row validation, inline fixes, Web Worker encoding, progress, cancellation and ZIP output with manifest.
- Nine built-in presets and local custom presets with JSON import/export.
- Opt-in local history, dark/light/system themes, undo/redo, PWA manifest, service worker and icons.
- Cloudflare Worker API: `GET /api/health`, `GET /api/v1/schema`, `POST /api/v1/validate`, `POST /api/v1/generate` with genuine server-side PNG (resvg WebAssembly) and JPEG (bundled TypeScript encoder) rendering; OpenAPI 3.1 document.
- Optional, feature-flagged dynamic QR module backed by D1 with migrations and a deploy script.
- Security: strict CSP and hardening headers, SVG sanitizer, data-URL and file-signature validation, body/size limits, CORS allowlist, optional bearer token, no payload logging.
- Test suites: unit + round-trip decoding (ZXing-C++ and jsQR), API tests inside workerd, Playwright desktop and mobile tests.
- Documentation: README with Deploy to Cloudflare button, SECURITY.md, CONTRIBUTING.md, docs for the dynamic module and for adding content types, example API requests, example CSV and preset files.
