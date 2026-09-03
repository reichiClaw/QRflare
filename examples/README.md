# Examples

- `api/*.json` – request bodies for `POST /api/v1/generate` and `POST /api/v1/validate`. Use them with curl:

  ```bash
  curl -X POST https://flareqr-studio.YOUR-SUBDOMAIN.workers.dev/api/v1/generate \
    -H 'Content-Type: application/json' \
    -d @examples/api/url-gradient-png.json --output example-qr.png
  ```

- `batch-example.csv` – a CSV covering the reserved columns (`name`, `type`, `format`, `size`, `preset`, `data`) plus type-specific fields. Import it in the **Batch** view.
- `presets-example.json` – a preset export file. Import it under **Design → Presets → Import JSON**.

The example CSV is also produced by `exampleCsv()` in `src/shared/batch/rows.ts` (the "Download template" button) and validated by `tests/unit/raster-and-schema.test.ts`.
