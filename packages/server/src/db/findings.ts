import type { Db } from "@/db/connection.js";
import type { Finding, SourceName } from "@/sources/source.js";

export interface UpsertResult {
  inserted: number;
  seenAgain: number;
}

/**
 * Upserts findings discovered during a scan.
 *
 * - New (source, url) → inserts with first_seen_scan_id = last_seen_scan_id = scanId.
 * - Existing (source, url) → bumps last_seen_scan_id = scanId (does not touch
 *   title/snippet/event_date because later scans might have worse data,
 *   e.g. shorter HN snippets).
 */
export function upsertFindings(
  db: Db,
  scanId: number,
  findings: Finding[],
): UpsertResult {
  if (findings.length === 0) return { inserted: 0, seenAgain: 0 };

  // Two-step upsert: INSERT OR IGNORE tells us whether the row is new;
  // if it wasn't, we bump last_seen_scan_id (keeping structured metadata
  // like stars fresh as well — but never touching title/snippet, since
  // later scans can have worse data, e.g. shorter HN snippets).
  const insertStmt = db.prepare(
    `INSERT OR IGNORE INTO finding
       (scan_id, source, tab, url, title, snippet, event_date,
        relevance_score, similarity_score,
        thumbnail_url, favicon_url, points, comments,
        owner, repo_name, description, stars, language, last_pushed_at,
        first_seen_scan_id, last_seen_scan_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const updateStmt = db.prepare(
    `UPDATE finding
        SET last_seen_scan_id = ?,
            stars           = COALESCE(?, stars),
            last_pushed_at  = COALESCE(?, last_pushed_at),
            points          = COALESCE(?, points),
            comments        = COALESCE(?, comments)
      WHERE source = ? AND url = ?`,
  );

  const nowISO = new Date().toISOString();
  let inserted = 0;
  let seenAgain = 0;

  const tx = db.transaction(() => {
    for (const f of findings) {
      const res = insertStmt.run(
        scanId,
        f.source,
        f.tab,
        f.url,
        f.title,
        f.snippet,
        f.eventDate,
        f.relevanceScore ?? null,
        f.similarityScore ?? null,
        f.thumbnailUrl ?? null,
        f.faviconUrl ?? null,
        f.points ?? null,
        f.comments ?? null,
        f.owner ?? null,
        f.repoName ?? null,
        f.description ?? null,
        f.stars ?? null,
        f.language ?? null,
        f.lastPushedAt ?? null,
        scanId,
        scanId,
        nowISO,
      );
      if (res.changes > 0) {
        inserted++;
      } else {
        updateStmt.run(
          scanId,
          f.stars ?? null,
          f.lastPushedAt ?? null,
          f.points ?? null,
          f.comments ?? null,
          f.source,
          f.url,
        );
        seenAgain++;
      }
    }
  });
  tx();

  return { inserted, seenAgain };
}

export interface FindingRow {
  id: number;
  scan_id: number;
  source: SourceName;
  tab: "news" | "github";
  url: string;
  title: string;
  snippet: string | null;
  event_date: string | null;
  relevance_score: number | null;
  similarity_score: number | null;
  first_seen_scan_id: number;
  last_seen_scan_id: number;
  dismissed: number;
  read_at: string | null;
  thumbnail_url: string | null;
  favicon_url: string | null;
  points: number | null;
  comments: number | null;
  owner: string | null;
  repo_name: string | null;
  description: string | null;
  stars: number | null;
  language: string | null;
  last_pushed_at: string | null;
  created_at: string;
}

export type NewFinding = FindingRow;

/**
 * Returns findings first seen during `scanId` (the "what's new" set).
 */
export function listNewFindingsSince(
  db: Db,
  projectId: number,
  scanId: number,
): NewFinding[] {
  return db
    .prepare<[number, number], NewFinding>(
      `SELECT f.*
       FROM finding f
       JOIN scan s ON f.scan_id = s.id
       JOIN repo r ON s.repo_id = r.id
       WHERE r.project_id = ?
         AND f.first_seen_scan_id = ?
         AND f.dismissed = 0
       ORDER BY COALESCE(f.relevance_score, 0) DESC`,
    )
    .all(projectId, scanId);
}

/**
 * Counts findings first seen during `scanId`. Cheaper than listing.
 */
export function countNewFindingsSince(
  db: Db,
  projectId: number,
  scanId: number,
): number {
  const row = db
    .prepare<[number, number], { c: number }>(
      `SELECT COUNT(*) AS c
       FROM finding f
       JOIN scan s ON f.scan_id = s.id
       JOIN repo r ON s.repo_id = r.id
       WHERE r.project_id = ?
         AND f.first_seen_scan_id = ?
         AND f.dismissed = 0`,
    )
    .get(projectId, scanId);
  return row?.c ?? 0;
}

/**
 * Dismisses (soft-hides) a single finding by id. Returns number of rows affected.
 */
export function dismissFinding(db: Db, findingId: number): number {
  const res = db
    .prepare("UPDATE finding SET dismissed = 1 WHERE id = ?")
    .run(findingId);
  return res.changes;
}

export function markFindingRead(db: Db, findingId: number, nowISO = new Date().toISOString()): number {
  const res = db
    .prepare("UPDATE finding SET read_at = ? WHERE id = ?")
    .run(nowISO, findingId);
  return res.changes;
}

export function markFindingUnread(db: Db, findingId: number): number {
  const res = db
    .prepare("UPDATE finding SET read_at = NULL WHERE id = ?")
    .run(findingId);
  return res.changes;
}

export function markActivityRead(db: Db, activityId: number, nowISO = new Date().toISOString()): number {
  const res = db
    .prepare("UPDATE repo_activity SET read_at = ? WHERE id = ?")
    .run(nowISO, activityId);
  return res.changes;
}

export function markActivityUnread(db: Db, activityId: number): number {
  const res = db
    .prepare("UPDATE repo_activity SET read_at = NULL WHERE id = ?")
    .run(activityId);
  return res.changes;
}

/**
 * Returns findings in the given scan that still need thumbnail/favicon
 * enrichment. github_similar is skipped because it already ships structured
 * thumbnailUrl from the source.
 */
export function listFindingsNeedingEnrichment(
  db: Db,
  scanId: number,
): { id: number; url: string }[] {
  return db
    .prepare<[number], { id: number; url: string }>(
      `SELECT id, url FROM finding
       WHERE first_seen_scan_id = ?
         AND source <> 'github_similar'
         AND thumbnail_url IS NULL
         AND favicon_url IS NULL`,
    )
    .all(scanId);
}

export function updateFindingEnrichment(
  db: Db,
  findingId: number,
  meta: { thumbnailUrl: string | null; faviconUrl: string | null },
): void {
  db.prepare(
    `UPDATE finding SET thumbnail_url = ?, favicon_url = ? WHERE id = ?`,
  ).run(meta.thumbnailUrl, meta.faviconUrl, findingId);
}

/**
 * Returns the latest successful/partial scan id for a project.
 * Used to compute "new since last scan" counts and `since` cutoffs.
 */
export function getLatestScanIdForProject(
  db: Db,
  projectId: number,
): number | null {
  const row = db
    .prepare<[number], { id: number }>(
      `SELECT s.id FROM scan s
       JOIN repo r ON s.repo_id = r.id
       WHERE r.project_id = ?
         AND s.status IN ('success', 'partial')
       ORDER BY s.started_at DESC LIMIT 1`,
    )
    .get(projectId);
  return row?.id ?? null;
}

/**
 * Lists findings for a project, optionally filtered by tab.
 * Results ordered by event_date (most recent first), falling back to
 * first_seen_scan_id for items without an event_date.
 */
export function listFindingsForProject(
  db: Db,
  projectId: number,
  opts: { tab?: "news" | "github"; limit?: number; includeDismissed?: boolean } = {},
): FindingRow[] {
  const limit = opts.limit ?? 100;
  const params: (string | number)[] = [projectId];
  let sql = `
    SELECT f.*
    FROM finding f
    JOIN scan s ON f.scan_id = s.id
    JOIN repo r ON s.repo_id = r.id
    WHERE r.project_id = ?`;
  if (!opts.includeDismissed) {
    sql += " AND f.dismissed = 0";
  }
  if (opts.tab) {
    sql += " AND f.tab = ?";
    params.push(opts.tab);
  }
  sql += " ORDER BY COALESCE(f.event_date, f.created_at) DESC LIMIT ?";
  params.push(limit);

  return db.prepare<typeof params, FindingRow>(sql).all(...params);
}
