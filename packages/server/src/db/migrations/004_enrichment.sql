-- Finding enrichment columns.
--
-- Thumbnail + favicon apply to all sources (populated at scan time when
-- possible; NULL when the fetcher times out or the page has no og:image).
-- points + comments are HN/PH-specific; other sources leave them NULL.
ALTER TABLE finding ADD COLUMN thumbnail_url TEXT;
ALTER TABLE finding ADD COLUMN favicon_url   TEXT;
ALTER TABLE finding ADD COLUMN points        INTEGER;
ALTER TABLE finding ADD COLUMN comments      INTEGER;

-- Competitor structured fields (only populated for source='github_similar').
-- These replace the snippet-parsing workaround on the client.
ALTER TABLE finding ADD COLUMN owner          TEXT;
ALTER TABLE finding ADD COLUMN repo_name      TEXT;
ALTER TABLE finding ADD COLUMN description    TEXT;
ALTER TABLE finding ADD COLUMN stars          INTEGER;
ALTER TABLE finding ADD COLUMN language       TEXT;
ALTER TABLE finding ADD COLUMN last_pushed_at TEXT;
