-- EdgeQR Studio – optional dynamic QR module.
-- Applied automatically by `npm run deploy:dynamic` (wrangler d1 migrations apply).

CREATE TABLE IF NOT EXISTS links (
  code        TEXT PRIMARY KEY,
  destination TEXT NOT NULL,
  label       TEXT,
  enabled     INTEGER NOT NULL DEFAULT 1,
  expires_at  TEXT,                       -- ISO 8601 timestamp or NULL
  max_scans   INTEGER,                    -- NULL = unlimited
  scan_count  INTEGER NOT NULL DEFAULT 0, -- aggregate counter only
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

-- Aggregate scans per UTC day. No IP addresses, user agents or identifiers.
CREATE TABLE IF NOT EXISTS scan_daily (
  code  TEXT NOT NULL,
  day   TEXT NOT NULL,                     -- YYYY-MM-DD
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (code, day)
);

CREATE INDEX IF NOT EXISTS idx_links_created_at ON links (created_at DESC);
