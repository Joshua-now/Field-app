-- Persistent audit log — append-only, never update rows
CREATE TABLE IF NOT EXISTS audit_logs (
  id          BIGSERIAL PRIMARY KEY,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  request_id  TEXT,
  method      TEXT NOT NULL,
  path        TEXT NOT NULL,
  ip          TEXT,
  user_agent  TEXT,
  user_id     TEXT,
  tenant_id   TEXT,
  status_code INTEGER,
  duration_ms INTEGER
);

-- Index for querying by tenant and time window (support + compliance lookups)
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_time ON audit_logs (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_time   ON audit_logs (user_id, created_at DESC);
