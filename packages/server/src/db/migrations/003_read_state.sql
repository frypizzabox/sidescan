-- Read state for findings + repo activity. ISO-8601 UTC string, NULL = unread.
-- Client flips via POST /findings/:id/read (and /activity/:id/read).
ALTER TABLE finding       ADD COLUMN read_at TEXT;
ALTER TABLE repo_activity ADD COLUMN read_at TEXT;

CREATE INDEX idx_finding_read_at  ON finding(read_at);
CREATE INDEX idx_activity_read_at ON repo_activity(read_at);
