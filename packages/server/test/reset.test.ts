import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb, type Db } from "@/db/connection.js";
import { migrate } from "@/db/migrate.js";
import { resetProject } from "@/scanner/reset.js";
import { insertProject, insertRepo } from "@/db/queries.js";

describe("resetProject", () => {
  let dir: string;
  let db: Db;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "sidescan-reset-"));
    db = openDb(join(dir, "test.db"));
    migrate(db);
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("deletes scans + findings + activity + ai_summary for a project, keeps project/repo rows", () => {
    const projectId = insertProject(db, {
      slug: "alpha",
      name: "Alpha",
      description: "x",
      scan_frequency: "manual",
      scan_time: null,
      bootstrap_lookback_years: 2,
    });
    const repoId = insertRepo(db, projectId, "/tmp/a");

    const now = new Date().toISOString();
    const scan = db
      .prepare(
        "INSERT INTO scan (repo_id, started_at, status) VALUES (?, ?, 'success')",
      )
      .run(repoId, now);
    const scanId = Number(scan.lastInsertRowid);

    db.prepare(
      `INSERT INTO finding (scan_id, source, tab, url, title, snippet, event_date,
                            relevance_score, similarity_score, first_seen_scan_id,
                            last_seen_scan_id, created_at)
       VALUES (?, 'hn', 'news', 'https://a', 'A', 's', ?, NULL, NULL, ?, ?, ?)`,
    ).run(scanId, now, scanId, scanId, now);

    db.prepare(
      `INSERT INTO repo_activity (scan_id, repo_id, kind, ref, title, event_date, created_at)
       VALUES (?, ?, 'commit', 'abc', 'one', ?, ?)`,
    ).run(scanId, repoId, now, now);

    db.prepare(
      `INSERT INTO ai_summary (scan_id, kind, content_md, created_at)
       VALUES (?, 'project_inference', 'x', ?)`,
    ).run(scanId, now);

    db.prepare(
      "UPDATE project SET ai_inferred_summary = 'cached' WHERE id = ?",
    ).run(projectId);
    db.prepare(
      "UPDATE repo SET last_commit_sha_seen = 'abc' WHERE id = ?",
    ).run(repoId);

    const summary = resetProject(db, "alpha");
    expect(summary.scansDeleted).toBe(1);

    // Project + repo rows persist
    const remaining = db
      .prepare<[number], { c: number }>(
        "SELECT COUNT(*) AS c FROM project WHERE id = ?",
      )
      .get(projectId) as { c: number };
    expect(remaining.c).toBe(1);

    // Everything else wiped
    const counts = {
      scans: db.prepare<[], { c: number }>("SELECT COUNT(*) AS c FROM scan").get()?.c,
      findings: db.prepare<[], { c: number }>("SELECT COUNT(*) AS c FROM finding").get()?.c,
      activity: db.prepare<[], { c: number }>("SELECT COUNT(*) AS c FROM repo_activity").get()?.c,
      summaries: db.prepare<[], { c: number }>("SELECT COUNT(*) AS c FROM ai_summary").get()?.c,
    };
    expect(counts).toEqual({ scans: 0, findings: 0, activity: 0, summaries: 0 });

    // Cache-like fields cleared on repo + project
    const proj = db
      .prepare<[number], { ai_inferred_summary: string | null }>(
        "SELECT ai_inferred_summary FROM project WHERE id = ?",
      )
      .get(projectId);
    expect(proj?.ai_inferred_summary).toBeNull();

    const repo = db
      .prepare<[number], { last_commit_sha_seen: string | null }>(
        "SELECT last_commit_sha_seen FROM repo WHERE id = ?",
      )
      .get(repoId);
    expect(repo?.last_commit_sha_seen).toBeNull();
  });

  it("throws on unknown slug", () => {
    expect(() => resetProject(db, "nope")).toThrow(/Unknown project/);
  });
});
