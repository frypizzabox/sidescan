-- Sidescan initial schema
-- Timestamps are ISO-8601 UTC strings. Foreign keys enabled per-connection.
-- Note: schema_migrations is created by the migration runner itself, not here.

CREATE TABLE project (
  id                       INTEGER PRIMARY KEY AUTOINCREMENT,
  slug                     TEXT NOT NULL UNIQUE,
  name                     TEXT NOT NULL,
  description              TEXT,
  ai_inferred_summary      TEXT,
  scan_frequency           TEXT NOT NULL CHECK (scan_frequency IN ('daily','weekly','hourly','manual')),
  scan_time                TEXT,
  bootstrap_lookback_years INTEGER NOT NULL DEFAULT 2,
  hidden                   INTEGER NOT NULL DEFAULT 0,
  created_at               TEXT NOT NULL,
  updated_at               TEXT NOT NULL
);

CREATE INDEX idx_project_slug ON project(slug);

CREATE TABLE repo (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id            INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  path                  TEXT NOT NULL,
  last_scanned_at       TEXT,
  last_commit_sha_seen  TEXT,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL,
  UNIQUE (project_id, path)
);

CREATE INDEX idx_repo_project ON repo(project_id);

CREATE TABLE scan (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_id       INTEGER NOT NULL REFERENCES repo(id) ON DELETE CASCADE,
  started_at    TEXT NOT NULL,
  finished_at   TEXT,
  status        TEXT NOT NULL CHECK (status IN ('running','success','partial','failed')),
  ai_provider   TEXT,
  cost_estimate REAL,
  error_message TEXT,
  is_bootstrap  INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_scan_repo    ON scan(repo_id);
CREATE INDEX idx_scan_started ON scan(started_at);

CREATE TABLE finding (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  scan_id            INTEGER NOT NULL REFERENCES scan(id) ON DELETE CASCADE,
  source             TEXT NOT NULL CHECK (source IN ('github_similar','hn','ph','web')),
  tab                TEXT NOT NULL CHECK (tab IN ('news','github')),
  url                TEXT NOT NULL,
  title              TEXT NOT NULL,
  snippet            TEXT,
  event_date         TEXT,
  relevance_score    REAL,
  similarity_score   REAL,
  first_seen_scan_id INTEGER NOT NULL REFERENCES scan(id),
  last_seen_scan_id  INTEGER NOT NULL REFERENCES scan(id),
  dismissed          INTEGER NOT NULL DEFAULT 0,
  created_at         TEXT NOT NULL,
  UNIQUE (source, url)
);

CREATE INDEX idx_finding_scan        ON finding(scan_id);
CREATE INDEX idx_finding_first_seen  ON finding(first_seen_scan_id);
CREATE INDEX idx_finding_last_seen   ON finding(last_seen_scan_id);
CREATE INDEX idx_finding_event_date  ON finding(event_date);
CREATE INDEX idx_finding_tab         ON finding(tab);

CREATE TABLE repo_activity (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  scan_id    INTEGER NOT NULL REFERENCES scan(id) ON DELETE CASCADE,
  repo_id    INTEGER NOT NULL REFERENCES repo(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('commit','release','issue','pr')),
  ref        TEXT NOT NULL,
  title      TEXT NOT NULL,
  event_date TEXT NOT NULL,
  url        TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (repo_id, kind, ref)
);

CREATE INDEX idx_activity_repo       ON repo_activity(repo_id);
CREATE INDEX idx_activity_event_date ON repo_activity(event_date);
CREATE INDEX idx_activity_scan       ON repo_activity(scan_id);

CREATE TABLE ai_summary (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  scan_id    INTEGER NOT NULL REFERENCES scan(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('project_inference','whats_new')),
  content_md TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_ai_summary_scan ON ai_summary(scan_id);
