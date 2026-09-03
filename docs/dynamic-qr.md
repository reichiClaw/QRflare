# Optional module: dynamic QR codes

Static QR codes encode their content directly and need no infrastructure. The **dynamic module** adds short redirect links (`https://your-worker.workers.dev/r/<code>`) whose destination you can change after the code has been printed. It is **off by default** and the standard one-click deployment never depends on it.

## What it provides

- Short codes (`/r/abcd1234`) redirecting (`302`) to an editable `http(s)` destination.
- Per-link label, enable/disable switch, optional expiry date and optional maximum number of scans.
- Privacy-preserving statistics: a total scan counter and per-UTC-day counts. **No IP addresses, user agents, referrers, cookies or fingerprints are stored.** Redirect responses carry `Referrer-Policy: no-referrer` and `Cache-Control: no-store`.
- An admin HTTP API (`/api/v1/dynamic/links…`) protected by a bearer token, and a "Dynamic links" tab in the web UI that appears automatically when the module is enabled.

## Requirements

- A Cloudflare **D1** database (free tier is sufficient).
- Two settings: the variable `DYNAMIC_QR_ENABLED="true"` and the secret `DYNAMIC_ADMIN_TOKEN`.

## Enabling it

1. Create the database and note the `database_id` printed by Wrangler:

   ```bash
   npx wrangler d1 create edgeqr-dynamic
   ```

2. Add the binding and flip the flag in `wrangler.jsonc` (or copy [`wrangler.dynamic.example.jsonc`](../wrangler.dynamic.example.jsonc)):

   ```jsonc
   "vars": { /* … */ "DYNAMIC_QR_ENABLED": "true" },
   "d1_databases": [
     {
       "binding": "DYNAMIC_DB",
       "database_name": "edgeqr-dynamic",
       "database_id": "<paste the id here>",
       "migrations_dir": "migrations"
     }
   ]
   ```

3. Set the admin token (choose a long random string, e.g. `openssl rand -base64 32`):

   ```bash
   npx wrangler secret put DYNAMIC_ADMIN_TOKEN
   ```

4. Deploy with the helper script. It reads your Wrangler config, applies pending D1 migrations to the database bound as `DYNAMIC_DB`, builds the app and deploys:

   ```bash
   npm run deploy:dynamic
   # or with a different config file:
   npm run deploy:dynamic -- --config wrangler.dynamic.example.jsonc
   ```

`GET /api/health` now reports `"features": { "dynamicQr": true }` and the UI shows the **Dynamic links** tab.

For local development, put the same values in `.dev.vars` and run `npx wrangler d1 migrations apply edgeqr-dynamic --local`.

## Using it

### Web UI

Open **Dynamic links**, paste the admin token (kept in memory for the tab only), load the links, create a new one and click **Use in studio** to put the short URL into the URL editor. Style and export it like any other code.

### API

All admin endpoints require `Authorization: Bearer <DYNAMIC_ADMIN_TOKEN>`.

```bash
BASE=https://edgeqr-studio.YOUR-SUBDOMAIN.workers.dev
TOKEN=...

# create
curl -s -X POST $BASE/api/v1/dynamic/links -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"destination":"https://example.com/spring-menu","label":"Menu","maxScans":10000,"expiresAt":"2027-01-01T00:00:00Z"}'

# list
curl -s $BASE/api/v1/dynamic/links -H "Authorization: Bearer $TOKEN"

# details + scans per day
curl -s $BASE/api/v1/dynamic/links/abcd1234 -H "Authorization: Bearer $TOKEN"

# change destination / disable
curl -s -X PATCH $BASE/api/v1/dynamic/links/abcd1234 -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"destination":"https://example.com/summer-menu","enabled":true}'

# delete
curl -s -X DELETE $BASE/api/v1/dynamic/links/abcd1234 -H "Authorization: Bearer $TOKEN"
```

Full schemas are in [`public/openapi.yaml`](../public/openapi.yaml).

## Data model

See [`migrations/0001_create_links.sql`](../migrations/0001_create_links.sql):

- `links(code, destination, label, enabled, expires_at, max_scans, scan_count, created_at, updated_at)`
- `scan_daily(code, day, count)`

## Disabling it

Set `DYNAMIC_QR_ENABLED` to `"false"` (or remove the D1 binding) and redeploy. Existing printed `/r/<code>` links then show a static "link unavailable" page. Delete the D1 database with `npx wrangler d1 delete edgeqr-dynamic` if you no longer need the data.
