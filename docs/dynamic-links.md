# Dynamic links

A dynamic QR code does not encode the final destination. It encodes a short URL that redirects to a destination you can change at any time – print once, update forever. FlareQR Studio supports two ways to host these short links, configured in **Admin → Settings → Dynamic links**.

| Provider     | Where links live               | Short link format                    | Statistics                       |
| ------------ | ------------------------------ | ------------------------------------ | -------------------------------- |
| **Built-in** | This Worker's D1 database      | `https://<your-domain>/r/<code>`     | Aggregate total + per-day counts |
| **Sink**     | Your self-hosted Sink instance | `https://<short-link-domain>/<slug>` | Sink dashboard (link per entry)  |

Both providers use the same **Links** page and the same `/api/v1/links` API.

## Built-in provider

Nothing to install: the database is provisioned automatically with the Worker and the tables are created on first use.

1. Admin → Settings → **Provider: Built-in (this Worker)**.
2. Optional: if the Worker is reachable under custom domains (see README → Custom domain), list them under **Available domains** and pick the **Domain used in generated QR codes** (e.g. `https://qr.example.com`). Codes then encode that domain instead of `*.workers.dev`. The selection must be one of the listed domains; the default is this deployment's own origin.
3. Save.

Each link has a destination, optional label, enable/disable switch, optional expiry and optional maximum number of scans. Visiting `/r/<code>` returns `302` with `Referrer-Policy: no-referrer` and `Cache-Control: no-store`; disabled, expired, exhausted or unknown codes show a static "link unavailable" page.

**Privacy:** only two counters are stored per link – the total and the count per UTC day. No IP addresses, user agents, referrers, cookies or fingerprints.

## Sink provider

[Sink](https://github.com/miantiao-me/sink) is a popular self-hosted link shortener on Cloudflare with analytics, QR codes and a dashboard. If you already run one, FlareQR Studio can create and manage links there and encode Sink's short URLs.

1. In Sink, note the value of `NUXT_SITE_TOKEN` (the dashboard password / API token, at least 8 characters).
2. Open Sink's dashboard → **Links** once so Sink initialises its storage (otherwise its API answers `423 storage not ready`).
3. In FlareQR Studio: Admin → Settings → **Provider: Sink instance**.
   - **Sink URL:** where the Sink dashboard is served, e.g. `https://s.example.com`.
   - **Sink site token:** the `NUXT_SITE_TOKEN`.
   - **Available domains / Domain used in generated QR codes:** Sink builds short links from whatever host is requested, so every domain you attach to the Sink Worker works. List those domains (one per line) and select the one QR codes should carry, e.g. `https://go.example.com` → codes encode `https://go.example.com/<slug>`. The default selection is the Sink URL itself.
4. Click **Test connection** (calls Sink's `/api/verify`), then **Save settings**.

What FlareQR Studio calls on your Sink instance (always with `Authorization: Bearer <token>`):

| Action  | Sink endpoint               |
| ------- | --------------------------- |
| List    | `GET /api/link/list`        |
| Inspect | `GET /api/link/query?slug=` |
| Create  | `POST /api/link/create`     |
| Update  | `PUT /api/link/edit`        |
| Delete  | `POST /api/link/delete`     |
| Test    | `GET /api/verify`           |

Sink's own features (analytics, geo routing, password-protected links, previews, …) remain available in Sink's dashboard; the **Stats** button on each link opens it. Redirects for Sink links are served by Sink, not by this Worker.

## Who can manage links

By default only logged-in admins can create, edit or delete links (the public **Links** page asks for the admin login). Switch on **Let anyone manage dynamic links** in the settings to make the Links page work without a password – recommended only for internal deployments, since it lets anyone create redirects on your domain.

## From a link to a QR code

On the Links page click **Use in studio**: the short URL is loaded into the URL content editor. Style and export it like any other code. Because the short URL never changes, you can re-point it later without touching the printed code.

## API

```bash
BASE=https://flareqr-studio.YOUR-SUBDOMAIN.workers.dev
SESSION=$(curl -s -X POST $BASE/api/admin/login -H 'Content-Type: application/json' -d '{"password":"…"}' | jq -r .token)

curl -s $BASE/api/v1/links -H "Authorization: Bearer $SESSION"
curl -s -X POST $BASE/api/v1/links -H "Authorization: Bearer $SESSION" -H 'Content-Type: application/json' \
  -d '{"destination":"https://example.com/spring","label":"Spring","expiresAt":"2027-01-01T00:00:00Z","maxScans":10000}'
curl -s $BASE/api/v1/links/CODE -H "Authorization: Bearer $SESSION"
curl -s -X PATCH $BASE/api/v1/links/CODE -H "Authorization: Bearer $SESSION" -H 'Content-Type: application/json' -d '{"destination":"https://example.com/summer","enabled":true}'
curl -s -X DELETE $BASE/api/v1/links/CODE -H "Authorization: Bearer $SESSION"
```

With public management enabled the `Authorization` header can be omitted. Full schemas: [`public/openapi.yaml`](../public/openapi.yaml).

## Switching providers or turning links off

Changing the provider does not migrate links: built-in links stay in D1 (and `/r/<code>` keeps working only while the built-in provider is active), Sink links stay in Sink. Setting the provider to **Off** hides the Links page and returns `404` for `/r/*` and `/api/v1/links`.
