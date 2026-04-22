import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb, type Db } from "@/db/connection.js";
import { migrate } from "@/db/migrate.js";
import {
  insertProject,
  insertRepo,
  listReposForProject,
} from "@/db/queries.js";
import {
  upsertFindings,
  countNewFindingsBySource,
  countNewActivityByKind,
  listDigestHighlights,
} from "@/db/findings.js";
import type { Finding } from "@/sources/source.js";

/**
 * End-to-end fixture builder: project + repo + scan + findings + activity.
 * Returns {projectId, scanId, repoId}.
 */
function seed(db: Db) {
  const projectId = insertProject(db, {
    slug: "p",
    name: "P",
    description: null,
    scan_frequency: "manual",
    scan_time: null,
    bootstrap_lookback_years: 2,
  });
  const repoId = insertRepo(db, projectId, "/tmp/repo");
  const scanInsert = db
    .prepare(
      "INSERT INTO scan (repo_id, started_at, status) VALUES (?, ?, 'success')",
    )
    .run(repoId, new Date().toISOString());
  const scanId = Number(scanInsert.lastInsertRowid);
  return { projectId, repoId, scanId };
}

function finding(
  source: Finding["source"],
  url: string,
  overrides: Partial<Finding> = {},
): Finding {
  return {
    source,
    tab: "news",
    url,
    title: `title ${url}`,
    snippet: null,
    eventDate: "2026-04-20T00:00:00Z",
    ...overrides,
  };
}

describe("countNewFindingsBySource", () => {
  let dir: string;
  let db: Db;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "sidescan-enriched-"));
    db = openDb(join(dir, "test.db"));
    migrate(db);
  });
  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns zero-key map when no findings", () => {
    const { projectId, scanId } = seed(db);
    expect(countNewFindingsBySource(db, projectId, scanId)).toEqual({});
  });

  it("groups by source, ignoring dismissed rows", () => {
    const { projectId, scanId } = seed(db);
    upsertFindings(db, scanId, [
      finding("hn", "https://a"),
      finding("hn", "https://b"),
      finding("reddit", "https://c"),
      finding("lobsters", "https://d"),
      finding("devto", "https://e"),
    ]);
    db.prepare("UPDATE finding SET dismissed = 1 WHERE url = ?").run(
      "https://b",
    );

    const counts = countNewFindingsBySource(db, projectId, scanId);
    expect(counts).toEqual({
      hn: 1,
      reddit: 1,
      lobsters: 1,
      devto: 1,
    });
  });

  it("only counts findings first seen in the given scan", () => {
    const { projectId, repoId, scanId: scan1 } = seed(db);
    upsertFindings(db, scan1, [finding("hn", "https://a")]);

    const scan2Id = Number(
      db
        .prepare(
          "INSERT INTO scan (repo_id, started_at, status) VALUES (?, ?, 'success')",
        )
        .run(repoId, new Date().toISOString()).lastInsertRowid,
    );
    upsertFindings(db, scan2Id, [
      finding("hn", "https://a"), // seen again, not new
      finding("reddit", "https://new"),
    ]);

    const counts = countNewFindingsBySource(db, projectId, scan2Id);
    expect(counts).toEqual({ reddit: 1 });
  });
});

describe("countNewActivityByKind", () => {
  let dir: string;
  let db: Db;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "sidescan-enriched-"));
    db = openDb(join(dir, "test.db"));
    migrate(db);
  });
  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns all-zero counts when no activity", () => {
    const { projectId, scanId } = seed(db);
    expect(countNewActivityByKind(db, projectId, scanId)).toEqual({
      commit: 0,
      release: 0,
      issue: 0,
      pr: 0,
    });
  });

  it("groups repo_activity rows inserted in this scan by kind", () => {
    const { projectId, repoId, scanId } = seed(db);
    const nowISO = new Date().toISOString();
    const insert = db.prepare(
      `INSERT INTO repo_activity
       (scan_id, repo_id, kind, ref, title, event_date, url, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`,
    );
    insert.run(scanId, repoId, "commit", "aaa", "feat", "2026-04-01", nowISO);
    insert.run(scanId, repoId, "commit", "bbb", "fix", "2026-04-02", nowISO);
    insert.run(scanId, repoId, "release", "v1", "Release 1", "2026-04-03", nowISO);
    insert.run(scanId, repoId, "issue", "#1", "bug", "2026-04-04", nowISO);
    insert.run(scanId, repoId, "pr", "#2", "PR", "2026-04-05", nowISO);

    expect(countNewActivityByKind(db, projectId, scanId)).toEqual({
      commit: 2,
      release: 1,
      issue: 1,
      pr: 1,
    });
  });

  it("ignores activity from other scans", () => {
    const { projectId, repoId, scanId: scan1 } = seed(db);
    const nowISO = new Date().toISOString();
    db.prepare(
      `INSERT INTO repo_activity
       (scan_id, repo_id, kind, ref, title, event_date, url, created_at)
       VALUES (?, ?, 'commit', 'aaa', 'a', '2026-04-01', NULL, ?)`,
    ).run(scan1, repoId, nowISO);

    const scan2 = Number(
      db
        .prepare(
          "INSERT INTO scan (repo_id, started_at, status) VALUES (?, ?, 'success')",
        )
        .run(repoId, nowISO).lastInsertRowid,
    );
    db.prepare(
      `INSERT INTO repo_activity
       (scan_id, repo_id, kind, ref, title, event_date, url, created_at)
       VALUES (?, ?, 'commit', 'bbb', 'b', '2026-04-02', NULL, ?)`,
    ).run(scan2, repoId, nowISO);

    const scan2Counts = countNewActivityByKind(db, projectId, scan2);
    expect(scan2Counts.commit).toBe(1);
  });
});

describe("listDigestHighlights", () => {
  let dir: string;
  let db: Db;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "sidescan-enriched-"));
    db = openDb(join(dir, "test.db"));
    migrate(db);
  });
  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns empty when no new findings", () => {
    const { projectId, scanId } = seed(db);
    expect(listDigestHighlights(db, projectId, scanId, 5)).toEqual([]);
  });

  it("ranks by relevance_score, then points, then event_date", () => {
    const { projectId, scanId } = seed(db);
    upsertFindings(db, scanId, [
      finding("hn", "https://low", { relevanceScore: 0.2, points: 100 }),
      finding("hn", "https://mid", { relevanceScore: 0.7, points: 10 }),
      finding("reddit", "https://top", { relevanceScore: 0.9, points: 5 }),
      finding("hn", "https://more-points", {
        relevanceScore: 0.7,
        points: 80,
      }),
    ]);

    const highlights = listDigestHighlights(db, projectId, scanId, 3);
    // top (0.9) first; the 0.7 tie breaks by points desc (more-points > mid)
    expect(highlights.map((h) => h.url)).toEqual([
      "https://top",
      "https://more-points",
      "https://mid",
    ]);
  });

  it("labels findings with source + points when available", () => {
    const { projectId, scanId } = seed(db);
    upsertFindings(db, scanId, [
      finding("hn", "https://a", { relevanceScore: 0.9, points: 42 }),
      finding("reddit", "https://b", { relevanceScore: 0.8 }),
      finding("devto", "https://c", { relevanceScore: 0.7, points: 0 }),
    ]);
    const highlights = listDigestHighlights(db, projectId, scanId, 3);
    expect(highlights[0]!.label).toBe("HN · 42 pts");
    expect(highlights[1]!.label).toBe("Reddit");
    // points:0 falls back to the plain label
    expect(highlights[2]!.label).toBe("Dev.to");
  });

  it("excludes dismissed findings", () => {
    const { projectId, scanId } = seed(db);
    upsertFindings(db, scanId, [
      finding("hn", "https://visible", { relevanceScore: 0.9 }),
      finding("hn", "https://hidden", { relevanceScore: 1.0 }),
    ]);
    db.prepare("UPDATE finding SET dismissed = 1 WHERE url = ?").run(
      "https://hidden",
    );
    const highlights = listDigestHighlights(db, projectId, scanId, 5);
    expect(highlights).toHaveLength(1);
    expect(highlights[0]!.url).toBe("https://visible");
  });

  it("caps at the requested limit", () => {
    const { projectId, scanId } = seed(db);
    upsertFindings(
      db,
      scanId,
      Array.from({ length: 10 }, (_, i) =>
        finding("hn", `https://x/${i}`, { relevanceScore: 0.5 }),
      ),
    );
    const highlights = listDigestHighlights(db, projectId, scanId, 3);
    expect(highlights).toHaveLength(3);
  });
});

describe("API /projects/:slug/whats-new enriched payload", () => {
  let dir: string;
  let db: Db;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "sidescan-enriched-api-"));
    db = openDb(join(dir, "test.db"));
    migrate(db);
  });
  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns content, counts, activityCounts, and highlights when a scan exists", async () => {
    const { projectId, repoId, scanId } = seed(db);
    upsertFindings(db, scanId, [
      finding("hn", "https://a", { relevanceScore: 0.9, points: 20 }),
      finding("reddit", "https://b", { relevanceScore: 0.8 }),
    ]);
    const nowISO = new Date().toISOString();
    db.prepare(
      `INSERT INTO repo_activity
       (scan_id, repo_id, kind, ref, title, event_date, url, created_at)
       VALUES (?, ?, 'commit', 'aaa', 'feat', '2026-04-01', NULL, ?),
              (?, ?, 'release', 'v1', 'r1', '2026-04-02', NULL, ?)`,
    ).run(scanId, repoId, nowISO, scanId, repoId, nowISO);

    db.prepare("UPDATE project SET slug = ?, name = ? WHERE id = ?").run(
      "p",
      "P",
      projectId,
    );

    const { createServer } = await import("@/api/server.js");
    const app = createServer({ db, version: "test" });
    const res = await app.request("/api/projects/p/whats-new");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      scanId: number | null;
      newCount: number;
      counts: Record<string, number>;
      activityCounts: { commit: number; release: number; issue: number; pr: number };
      highlights: { findingId: number; label: string }[];
    };

    expect(body.newCount).toBe(2);
    expect(body.counts).toEqual({ hn: 1, reddit: 1 });
    expect(body.activityCounts).toEqual({
      commit: 1,
      release: 1,
      issue: 0,
      pr: 0,
    });
    expect(body.highlights).toHaveLength(2);
    expect(body.highlights[0]!.label).toBe("HN · 20 pts");
  });
});
