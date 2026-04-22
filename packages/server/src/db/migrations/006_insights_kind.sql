-- Extend ai_summary.kind CHECK for the insights panels.
-- SQLite can't alter CHECK in place; rebuild.

CREATE TABLE ai_summary_new (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  scan_id    INTEGER NOT NULL REFERENCES scan(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN (
                 'project_inference',
                 'whats_new',
                 'insights_market',
                 'insights_suggestions'
             )),
  content_md TEXT NOT NULL,
  created_at TEXT NOT NULL
);

INSERT INTO ai_summary_new (id, scan_id, kind, content_md, created_at)
SELECT id, scan_id, kind, content_md, created_at FROM ai_summary;

DROP TABLE ai_summary;
ALTER TABLE ai_summary_new RENAME TO ai_summary;

CREATE INDEX idx_ai_summary_scan ON ai_summary(scan_id);
