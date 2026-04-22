import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb, type Db } from "@/db/connection.js";
import { migrate } from "@/db/migrate.js";
import {
  insertProject,
  insertRepo,
} from "@/db/queries.js";
import { listFindingSparkline } from "@/db/findings.js";
import { createServer } from "@/api/server.js";

function seed(db: Db, slug = "p") {
  const projectId = insertProject(db, {
    slug,
    name: slug.toUpperCase(),
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
  return { projectId, repoId, scanId: Number(scanInsert.lastInsertRowid) };
}

function insertFinding(
  db: Db,
  scanId: number,
  url: string,
  createdAt: string,
  dismissed = 0,
): void {
  db.prepare(
    `INSERT INTO finding
      (scan_id, source, tab, url, title, first_seen_scan_id, last_seen_scan_id, dismissed, created_at)
     VALUES (?, 'hn', 'news', ?, ?, ?, ?, ?, ?)`,
  ).run(scanId, url, `title ${url}`, scanId, scanId, dismissed, createdAt);
}

function daysAgoISO(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString();
}

describe("listFindingSparkline", () => {
  let dir: string;
  let db: Db;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "sidescan-sparkline-"));
    db = openDb(join(dir, "test.db"));
    migrate(db);
  });
  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns `days` buckets (contiguous, newest last)", () => {
    const { projectId } = seed(db);
    const buckets = listFindingSparkline(db, projectId, 7);
    expect(buckets).toHaveLength(7);
    // Last bucket is today; first is 6 days ago.
    const today = new Date().toISOString().slice(0, 10);
    expect(buckets[6]!.date).toBe(today);
    // Dates are strictly ascending.
    for (let i = 1; i < buckets.length; i++) {
      expect(buckets[i]!.date > buckets[i - 1]!.date).toBe(true);
    }
  });

  it("fills zero-counted days with zero", () => {
    const { projectId } = seed(db);
    const buckets = listFindingSparkline(db, projectId, 7);
    expect(buckets.every((b) => b.count === 0)).toBe(true);
  });

  it("counts findings per day", () => {
    const { projectId, scanId } = seed(db);
    insertFinding(db, scanId, "https://a", daysAgoISO(0));
    insertFinding(db, scanId, "https://b", daysAgoISO(0));
    insertFinding(db, scanId, "https://c", daysAgoISO(2));

    const buckets = listFindingSparkline(db, projectId, 7);
    const today = new Date().toISOString().slice(0, 10);
    const todayBucket = buckets.find((b) => b.date === today);
    expect(todayBucket?.count).toBe(2);

    const d2 = daysAgoISO(2).slice(0, 10);
    const twoDaysAgo = buckets.find((b) => b.date === d2);
    expect(twoDaysAgo?.count).toBe(1);
  });

  it("excludes dismissed findings", () => {
    const { projectId, scanId } = seed(db);
    insertFinding(db, scanId, "https://a", daysAgoISO(0), 1);
    insertFinding(db, scanId, "https://b", daysAgoISO(0), 0);
    const buckets = listFindingSparkline(db, projectId, 7);
    const today = new Date().toISOString().slice(0, 10);
    const todayBucket = buckets.find((b) => b.date === today);
    expect(todayBucket?.count).toBe(1);
  });

  it("excludes findings older than the window", () => {
    const { projectId, scanId } = seed(db);
    insertFinding(db, scanId, "https://old", daysAgoISO(20));
    insertFinding(db, scanId, "https://recent", daysAgoISO(3));
    const buckets = listFindingSparkline(db, projectId, 7);
    const total = buckets.reduce((sum, b) => sum + b.count, 0);
    expect(total).toBe(1);
  });

  it("only counts findings for the requested project", () => {
    const first = seed(db, "p");
    const other = seed(db, "q");
    insertFinding(db, first.scanId, "https://a", daysAgoISO(0));
    insertFinding(db, other.scanId, "https://b", daysAgoISO(0));
    const buckets = listFindingSparkline(db, first.projectId, 7);
    const total = buckets.reduce((sum, b) => sum + b.count, 0);
    expect(total).toBe(1);
  });
});

describe("API /projects/:slug/sparkline", () => {
  let dir: string;
  let db: Db;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "sidescan-sparkline-api-"));
    db = openDb(join(dir, "test.db"));
    migrate(db);
  });
  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns {days, buckets} for an existing project", async () => {
    const { scanId } = seed(db, "p");
    insertFinding(db, scanId, "https://a", daysAgoISO(0));

    const app = createServer({ db, version: "test" });
    const res = await app.request("/api/projects/p/sparkline?days=5");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      days: number;
      buckets: { date: string; count: number }[];
    };
    expect(body.days).toBe(5);
    expect(body.buckets).toHaveLength(5);
    const total = body.buckets.reduce((sum, b) => sum + b.count, 0);
    expect(total).toBe(1);
  });

  it("clamps days to [1, 90] and defaults to 30", async () => {
    seed(db, "p");
    const app = createServer({ db, version: "test" });

    const def = (await (
      await app.request("/api/projects/p/sparkline")
    ).json()) as { days: number; buckets: unknown[] };
    expect(def.days).toBe(30);
    expect(def.buckets).toHaveLength(30);

    const tooHigh = (await (
      await app.request("/api/projects/p/sparkline?days=500")
    ).json()) as { days: number };
    expect(tooHigh.days).toBe(90);

    const tooLow = (await (
      await app.request("/api/projects/p/sparkline?days=0")
    ).json()) as { days: number };
    expect(tooLow.days).toBe(30);

    const nonNumeric = (await (
      await app.request("/api/projects/p/sparkline?days=abc")
    ).json()) as { days: number };
    expect(nonNumeric.days).toBe(30);
  });

  it("returns 404 for unknown slug", async () => {
    const app = createServer({ db, version: "test" });
    const res = await app.request("/api/projects/unknown/sparkline");
    expect(res.status).toBe(404);
  });
});
