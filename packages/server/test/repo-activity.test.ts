import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readCommits, collectRepoActivity } from "@/scanner/repo-activity.js";
import { openDb, type Db } from "@/db/connection.js";
import { migrate } from "@/db/migrate.js";
import { insertProject, insertRepo, listReposForProject } from "@/db/queries.js";

function gitInit(repoDir: string): void {
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: repoDir });
  execFileSync("git", ["config", "user.email", "t@t.com"], { cwd: repoDir });
  execFileSync("git", ["config", "user.name", "T"], { cwd: repoDir });
}

function gitCommit(repoDir: string, file: string, message: string): string {
  writeFileSync(join(repoDir, file), `content ${Date.now()}`);
  execFileSync("git", ["add", file], { cwd: repoDir });
  execFileSync("git", ["commit", "-q", "-m", message], { cwd: repoDir });
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoDir })
    .toString()
    .trim();
}

describe("readCommits", () => {
  let repoDir: string;

  beforeEach(() => {
    repoDir = mkdtempSync(join(tmpdir(), "sidescan-activity-repo-"));
    gitInit(repoDir);
  });

  afterEach(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  it("returns empty array when .git is missing", async () => {
    const notARepo = mkdtempSync(join(tmpdir(), "sidescan-not-repo-"));
    try {
      const result = await readCommits(notARepo, { lookbackYears: 2 });
      expect(result).toEqual([]);
    } finally {
      rmSync(notARepo, { recursive: true, force: true });
    }
  });

  it("returns commits within the lookback window, newest first", async () => {
    gitCommit(repoDir, "a.txt", "feat: first");
    gitCommit(repoDir, "b.txt", "feat: second");
    const latestSha = gitCommit(repoDir, "c.txt", "feat: third");

    const commits = await readCommits(repoDir, { lookbackYears: 2 });
    expect(commits).toHaveLength(3);
    expect(commits[0]!.sha).toBe(latestSha);
    expect(commits[0]!.title).toBe("feat: third");
    expect(commits[2]!.title).toBe("feat: first");
  });

  it("returns only commits after sinceSha when given", async () => {
    const shaA = gitCommit(repoDir, "a.txt", "first");
    gitCommit(repoDir, "b.txt", "second");
    gitCommit(repoDir, "c.txt", "third");

    const commits = await readCommits(repoDir, {
      sinceSha: shaA,
      lookbackYears: 2,
    });
    expect(commits).toHaveLength(2);
    const titles = commits.map((c) => c.title);
    expect(titles).toEqual(["third", "second"]);
  });

  it("returns empty array on unknown sinceSha instead of throwing", async () => {
    gitCommit(repoDir, "a.txt", "first");
    const commits = await readCommits(repoDir, {
      sinceSha: "deadbeef".repeat(5),
      lookbackYears: 2,
    });
    expect(commits).toEqual([]);
  });
});

describe("collectRepoActivity", () => {
  let repoDir: string;
  let dbDir: string;
  let db: Db;

  beforeEach(() => {
    repoDir = mkdtempSync(join(tmpdir(), "sidescan-activity-repo-"));
    gitInit(repoDir);
    dbDir = mkdtempSync(join(tmpdir(), "sidescan-activity-db-"));
    db = openDb(join(dbDir, "test.db"));
    migrate(db);
  });

  afterEach(() => {
    db.close();
    rmSync(dbDir, { recursive: true, force: true });
    rmSync(repoDir, { recursive: true, force: true });
  });

  it("inserts repo_activity rows and updates last_commit_sha_seen", async () => {
    const projectId = insertProject(db, {
      slug: "p",
      name: "P",
      description: null,
      scan_frequency: "manual",
      scan_time: null,
      bootstrap_lookback_years: 2,
    });
    const repoId = insertRepo(db, projectId, repoDir);
    gitCommit(repoDir, "a.txt", "one");
    const latestSha = gitCommit(repoDir, "b.txt", "two");

    // Create a scan to attach activity to
    const scanInsert = db
      .prepare(
        "INSERT INTO scan (repo_id, started_at, status) VALUES (?, ?, 'running')",
      )
      .run(repoId, new Date().toISOString());
    const scanId = Number(scanInsert.lastInsertRowid);

    const repos = listReposForProject(db, projectId);
    const summary = await collectRepoActivity(
      db,
      scanId,
      repos[0]!,
      { type: "local", path: repoDir },
      2,
    );

    expect(summary.commitsRead).toBe(2);
    expect(summary.commitsInserted).toBe(2);
    expect(summary.latestSha).toBe(latestSha);
    expect(summary.isBootstrap).toBe(true);

    const activity = db
      .prepare<[number], { ref: string; title: string }>(
        "SELECT ref, title FROM repo_activity WHERE scan_id = ? ORDER BY event_date DESC",
      )
      .all(scanId);
    expect(activity).toHaveLength(2);

    const updatedRepo = db
      .prepare<[number], { last_commit_sha_seen: string | null }>(
        "SELECT last_commit_sha_seen FROM repo WHERE id = ?",
      )
      .get(repoId);
    expect(updatedRepo?.last_commit_sha_seen).toBe(latestSha);
  });

  it("second run is incremental, reads only new commits", async () => {
    const projectId = insertProject(db, {
      slug: "p",
      name: "P",
      description: null,
      scan_frequency: "manual",
      scan_time: null,
      bootstrap_lookback_years: 2,
    });
    const repoId = insertRepo(db, projectId, repoDir);
    gitCommit(repoDir, "a.txt", "one");

    const scan1 = db
      .prepare(
        "INSERT INTO scan (repo_id, started_at, status) VALUES (?, ?, 'running')",
      )
      .run(repoId, new Date().toISOString());
    await collectRepoActivity(
      db,
      Number(scan1.lastInsertRowid),
      listReposForProject(db, projectId)[0]!,
      { type: "local", path: repoDir },
      2,
    );

    gitCommit(repoDir, "b.txt", "two");
    gitCommit(repoDir, "c.txt", "three");

    const scan2 = db
      .prepare(
        "INSERT INTO scan (repo_id, started_at, status) VALUES (?, ?, 'running')",
      )
      .run(repoId, new Date().toISOString());
    const result = await collectRepoActivity(
      db,
      Number(scan2.lastInsertRowid),
      listReposForProject(db, projectId)[0]!,
      { type: "local", path: repoDir },
      2,
    );

    expect(result.commitsRead).toBe(2);
    expect(result.commitsInserted).toBe(2);
    expect(result.isBootstrap).toBe(false);
  });
});
