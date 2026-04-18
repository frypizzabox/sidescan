import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb, type Db } from "@/db/connection.js";
import { migrate } from "@/db/migrate.js";
import { upsertFindings, listFindingsForProject } from "@/db/findings.js";
import type { Finding } from "@/sources/source.js";
import {
  insertProject,
  insertRepo,
} from "@/db/queries.js";

function scenarioWithScan(db: Db, slug: string, path: string): {
  projectId: number;
  repoId: number;
  scanId: number;
} {
  const projectId = insertProject(db, {
    slug,
    name: slug,
    description: null,
    scan_frequency: "manual",
    scan_time: null,
    bootstrap_lookback_years: 2,
  });
  const repoId = insertRepo(db, projectId, path);
  const scan = db
    .prepare(
      "INSERT INTO scan (repo_id, started_at, status) VALUES (?, ?, 'running')",
    )
    .run(repoId, new Date().toISOString());
  return { projectId, repoId, scanId: Number(scan.lastInsertRowid) };
}

const EXAMPLE: Finding[] = [
  {
    source: "hn",
    tab: "news",
    url: "https://news.ycombinator.com/item?id=1",
    title: "HN story",
    snippet: "42 points",
    eventDate: "2026-03-01T10:00:00Z",
  },
  {
    source: "github_similar",
    tab: "github",
    url: "https://github.com/acme/widget",
    title: "acme/widget",
    snippet: "A widget",
    eventDate: "2026-03-01T00:00:00Z",
    similarityScore: 0.8,
  },
];

describe("upsertFindings", () => {
  let dir: string;
  let db: Db;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "sidescan-findings-"));
    db = openDb(join(dir, "test.db"));
    migrate(db);
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("inserts new findings", () => {
    const { scanId } = scenarioWithScan(db, "alpha", "/tmp/a");
    const result = upsertFindings(db, scanId, EXAMPLE);
    expect(result).toEqual({ inserted: 2, seenAgain: 0 });

    const count = db
      .prepare<[], { c: number }>("SELECT COUNT(*) as c FROM finding")
      .get();
    expect(count?.c).toBe(2);
  });

  it("re-upsert bumps last_seen_scan_id but keeps first_seen_scan_id", () => {
    const { repoId, scanId: firstScan } = scenarioWithScan(db, "alpha", "/tmp/a");
    upsertFindings(db, firstScan, EXAMPLE);

    // Second scan, same finding URLs
    const second = db
      .prepare(
        "INSERT INTO scan (repo_id, started_at, status) VALUES (?, ?, 'running')",
      )
      .run(repoId, new Date().toISOString());
    const secondScan = Number(second.lastInsertRowid);

    const result = upsertFindings(db, secondScan, EXAMPLE);
    expect(result).toEqual({ inserted: 0, seenAgain: 2 });

    const row = db
      .prepare<
        [string],
        { first_seen_scan_id: number; last_seen_scan_id: number }
      >(
        "SELECT first_seen_scan_id, last_seen_scan_id FROM finding WHERE url = ?",
      )
      .get("https://news.ycombinator.com/item?id=1");
    expect(row?.first_seen_scan_id).toBe(firstScan);
    expect(row?.last_seen_scan_id).toBe(secondScan);
  });

  it("listFindingsForProject filters by tab and excludes dismissed", () => {
    const { projectId, scanId } = scenarioWithScan(db, "alpha", "/tmp/a");
    upsertFindings(db, scanId, EXAMPLE);

    // Dismiss one
    db.prepare("UPDATE finding SET dismissed = 1 WHERE source = 'hn'").run();

    const allNonDismissed = listFindingsForProject(db, projectId);
    expect(allNonDismissed).toHaveLength(1);
    expect(allNonDismissed[0]!.source).toBe("github_similar");

    const withDismissed = listFindingsForProject(db, projectId, {
      includeDismissed: true,
    });
    expect(withDismissed).toHaveLength(2);

    const onlyGithub = listFindingsForProject(db, projectId, { tab: "github" });
    expect(onlyGithub).toHaveLength(1);
    expect(onlyGithub[0]!.source).toBe("github_similar");
  });
});
