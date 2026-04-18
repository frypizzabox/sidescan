import type { Db } from "@/db/connection.js";
import type { Finding } from "@/sources/source.js";

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
  // if it wasn't, we bump last_seen_scan_id. Simpler than ON CONFLICT DO
  // UPDATE because changes() reports 1 for that either way.
  const insertStmt = db.prepare(
    `INSERT OR IGNORE INTO finding
       (scan_id, source, tab, url, title, snippet, event_date,
        relevance_score, similarity_score,
        first_seen_scan_id, last_seen_scan_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const updateStmt = db.prepare(
    `UPDATE finding SET last_seen_scan_id = ? WHERE source = ? AND url = ?`,
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
        scanId,
        scanId,
        nowISO,
      );
      if (res.changes > 0) {
        inserted++;
      } else {
        updateStmt.run(scanId, f.source, f.url);
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
  source: "github_similar" | "hn" | "ph" | "web";
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
  created_at: string;
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
