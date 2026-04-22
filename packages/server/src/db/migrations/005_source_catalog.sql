-- Extend finding.source CHECK constraint for Reddit / Lobsters / Dev.to.
-- SQLite can't alter a CHECK in place; rebuild the table.

CREATE TABLE finding_new (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  scan_id            INTEGER NOT NULL REFERENCES scan(id) ON DELETE CASCADE,
  source             TEXT NOT NULL CHECK (source IN (
                         'github_similar','hn','ph','web',
                         'reddit','lobsters','devto'
                       )),
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
  read_at            TEXT,
  thumbnail_url      TEXT,
  favicon_url        TEXT,
  points             INTEGER,
  comments           INTEGER,
  owner              TEXT,
  repo_name          TEXT,
  description        TEXT,
  stars              INTEGER,
  language           TEXT,
  last_pushed_at     TEXT,
  UNIQUE (source, url)
);

INSERT INTO finding_new (
  id, scan_id, source, tab, url, title, snippet, event_date,
  relevance_score, similarity_score, first_seen_scan_id, last_seen_scan_id,
  dismissed, created_at, read_at,
  thumbnail_url, favicon_url, points, comments,
  owner, repo_name, description, stars, language, last_pushed_at
)
SELECT
  id, scan_id, source, tab, url, title, snippet, event_date,
  relevance_score, similarity_score, first_seen_scan_id, last_seen_scan_id,
  dismissed, created_at, read_at,
  thumbnail_url, favicon_url, points, comments,
  owner, repo_name, description, stars, language, last_pushed_at
FROM finding;

DROP TABLE finding;
ALTER TABLE finding_new RENAME TO finding;

CREATE INDEX idx_finding_scan       ON finding(scan_id);
CREATE INDEX idx_finding_first_seen ON finding(first_seen_scan_id);
CREATE INDEX idx_finding_last_seen  ON finding(last_seen_scan_id);
CREATE INDEX idx_finding_event_date ON finding(event_date);
CREATE INDEX idx_finding_tab        ON finding(tab);
CREATE INDEX idx_finding_read_at    ON finding(read_at);
