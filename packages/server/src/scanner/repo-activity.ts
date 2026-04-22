import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Db } from "@/db/connection.js";
import type { RepoRow } from "@/db/queries.js";
import type { RepoSpec } from "@/scanner/repo-spec.js";
import { collectGitHubRepoActivity } from "@/scanner/repo-activity-github.js";

const execFile = promisify(execFileCb);

export interface CommitRecord {
  sha: string;
  title: string;
  eventDate: string; // ISO-8601
}

export interface RepoActivitySummary {
  repoPath: string;
  commitsRead: number;
  commitsInserted: number;
  releasesInserted: number;
  issuesInserted: number;
  prsInserted: number;
  latestSha: string | null;
  isBootstrap: boolean;
}

/**
 * Collects recent commits from a git repo via `git log`.
 * - If `sinceSha` is provided (incremental scan), reads commits newer than it.
 * - Otherwise (bootstrap), reads commits within `lookbackYears`.
 * Emits a CommitRecord per commit, newest first.
 */
export async function readCommits(
  repoPath: string,
  opts: { sinceSha?: string | null; lookbackYears: number; maxCommits?: number },
): Promise<CommitRecord[]> {
  const gitDir = join(repoPath, ".git");
  if (!existsSync(gitDir)) {
    return [];
  }

  // Format: <sha>|<ISO date>|<title line>
  const args = ["-C", repoPath, "log", "--pretty=format:%H|%cI|%s"];

  if (opts.sinceSha) {
    args.push(`${opts.sinceSha}..HEAD`);
  } else {
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - opts.lookbackYears);
    args.push(`--since=${cutoff.toISOString()}`);
  }

  const max = opts.maxCommits ?? 500;
  args.push(`-n`, String(max));

  let stdout: string;
  try {
    const result = await execFile("git", args, { maxBuffer: 10 * 1024 * 1024 });
    stdout = result.stdout;
  } catch (err) {
    // If the base sha no longer exists (history rewritten, squash, etc.),
    // git log returns non-zero. Bail silently and let the caller fall back
    // to bootstrap on the next scan if needed.
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.includes("unknown revision") ||
      msg.includes("bad revision") ||
      msg.includes("Invalid revision range")
    ) {
      return [];
    }
    throw err;
  }

  return stdout
    .split("\n")
    .filter((line) => line.length > 0)
    .map(parseLine)
    .filter((c): c is CommitRecord => c !== null);
}

function parseLine(line: string): CommitRecord | null {
  const firstSep = line.indexOf("|");
  const secondSep = line.indexOf("|", firstSep + 1);
  if (firstSep < 0 || secondSep < 0) return null;
  const sha = line.slice(0, firstSep);
  const date = line.slice(firstSep + 1, secondSep);
  const title = line.slice(secondSep + 1);
  if (!sha || !date) return null;
  return { sha, eventDate: date, title };
}

/**
 * Collects activity for one repo. Dispatches to the GitHub API or local
 * `git log` based on the spec. Writes RepoActivity rows and updates
 * `repo.last_commit_sha_seen` for incremental scans.
 */
export async function collectRepoActivity(
  db: Db,
  scanId: number,
  repo: RepoRow,
  spec: RepoSpec,
  lookbackYears: number,
  githubToken: string | null = null,
): Promise<RepoActivitySummary> {
  if (spec.type === "github") {
    return collectGitHubRepoActivity(
      db,
      scanId,
      repo,
      spec,
      lookbackYears,
      githubToken,
    );
  }
  return collectLocalRepoActivity(db, scanId, repo, lookbackYears);
}

async function collectLocalRepoActivity(
  db: Db,
  scanId: number,
  repo: RepoRow,
  lookbackYears: number,
): Promise<RepoActivitySummary> {
  const isBootstrap = !repo.last_commit_sha_seen;
  const commits = await readCommits(repo.path, {
    sinceSha: repo.last_commit_sha_seen,
    lookbackYears,
  });

  const insertStmt = db.prepare(
    `INSERT OR IGNORE INTO repo_activity
      (scan_id, repo_id, kind, ref, title, event_date, url, created_at)
     VALUES (?, ?, 'commit', ?, ?, ?, NULL, ?)`,
  );
  const nowISO = new Date().toISOString();

  const insertTx = db.transaction((rows: CommitRecord[]) => {
    let inserted = 0;
    for (const c of rows) {
      const result = insertStmt.run(
        scanId,
        repo.id,
        c.sha,
        c.title,
        c.eventDate,
        nowISO,
      );
      if (result.changes > 0) inserted++;
    }
    return inserted;
  });
  const inserted = insertTx(commits);

  const latestSha = commits[0]?.sha ?? repo.last_commit_sha_seen ?? null;

  // Update repo.last_commit_sha_seen and last_scanned_at
  db.prepare(
    `UPDATE repo SET last_commit_sha_seen = ?, last_scanned_at = ?, updated_at = ?
     WHERE id = ?`,
  ).run(latestSha, nowISO, nowISO, repo.id);

  return {
    repoPath: repo.path,
    commitsRead: commits.length,
    commitsInserted: inserted,
    releasesInserted: 0,
    issuesInserted: 0,
    prsInserted: 0,
    latestSha,
    isBootstrap,
  };
}
