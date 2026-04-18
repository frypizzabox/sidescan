import { logger } from "@/lib/logger.js";
import type { Db } from "@/db/connection.js";
import type { RepoRow } from "@/db/queries.js";
import type { RepoSpec } from "@/scanner/repo-spec.js";
import type { RepoActivitySummary } from "@/scanner/repo-activity.js";

const GH_API = "https://api.github.com";
const MAX_COMMITS = 200;

interface GitHubCommitResponse {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author: { date: string };
    committer: { date: string };
  };
}

/**
 * Collects recent commits for a GitHub-hosted repo via the REST API and
 * writes them to repo_activity. Mirrors the shape of the local-git version.
 */
export async function collectGitHubRepoActivity(
  db: Db,
  scanId: number,
  repo: RepoRow,
  spec: Extract<RepoSpec, { type: "github" }>,
  lookbackYears: number,
  token: string | null,
): Promise<RepoActivitySummary> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "sidescan/0.1",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const isBootstrap = !repo.last_commit_sha_seen;
  const sinceISO = computeSinceISO(repo, lookbackYears);

  const commits = await fetchCommits({
    owner: spec.owner,
    repo: spec.repo,
    branch: spec.branch,
    since: sinceISO,
    headers,
  });

  // When incremental, stop at the last seen SHA (newer commits appear first).
  let relevant: GitHubCommitResponse[] = commits;
  if (repo.last_commit_sha_seen) {
    const idx = commits.findIndex(
      (c) => c.sha === repo.last_commit_sha_seen,
    );
    if (idx >= 0) relevant = commits.slice(0, idx);
  }

  const insertStmt = db.prepare(
    `INSERT OR IGNORE INTO repo_activity
      (scan_id, repo_id, kind, ref, title, event_date, url, created_at)
     VALUES (?, ?, 'commit', ?, ?, ?, ?, ?)`,
  );
  const nowISO = new Date().toISOString();

  const insertTx = db.transaction(() => {
    let inserted = 0;
    for (const c of relevant) {
      const title = c.commit.message.split("\n")[0]!;
      const eventDate = c.commit.committer.date ?? c.commit.author.date;
      const result = insertStmt.run(
        scanId,
        repo.id,
        c.sha,
        title,
        eventDate,
        c.html_url,
        nowISO,
      );
      if (result.changes > 0) inserted++;
    }
    return inserted;
  });
  const inserted = insertTx();

  const latestSha = relevant[0]?.sha ?? repo.last_commit_sha_seen ?? null;
  db.prepare(
    `UPDATE repo SET last_commit_sha_seen = ?, last_scanned_at = ?, updated_at = ?
     WHERE id = ?`,
  ).run(latestSha, nowISO, nowISO, repo.id);

  return {
    repoPath: spec.url,
    commitsRead: relevant.length,
    commitsInserted: inserted,
    latestSha,
    isBootstrap,
  };
}

function computeSinceISO(repo: RepoRow, lookbackYears: number): string {
  if (repo.last_commit_sha_seen && repo.last_scanned_at) {
    // Use a small overlap so a push mid-scan doesn't escape — `since` filter
    // combined with the sha-stop above de-dupes cleanly.
    const d = new Date(repo.last_scanned_at);
    d.setDate(d.getDate() - 1);
    return d.toISOString();
  }
  const d = new Date();
  d.setFullYear(d.getFullYear() - lookbackYears);
  return d.toISOString();
}

async function fetchCommits(opts: {
  owner: string;
  repo: string;
  branch: string | null;
  since: string;
  headers: Record<string, string>;
}): Promise<GitHubCommitResponse[]> {
  const out: GitHubCommitResponse[] = [];
  let page = 1;
  const perPage = 100;
  const maxPages = Math.ceil(MAX_COMMITS / perPage);

  while (page <= maxPages) {
    const params = new URLSearchParams({
      since: opts.since,
      per_page: String(perPage),
      page: String(page),
    });
    if (opts.branch) params.set("sha", opts.branch);
    const url = `${GH_API}/repos/${opts.owner}/${opts.repo}/commits?${params.toString()}`;

    let res: Response;
    try {
      res = await fetch(url, { headers: opts.headers });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn({ url, err: msg }, "GitHub commits fetch errored");
      break;
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      logger.warn(
        { url, status: res.status, body: body.slice(0, 200) },
        "GitHub commits fetch failed",
      );
      break;
    }

    const batch = (await res.json()) as GitHubCommitResponse[];
    if (!Array.isArray(batch) || batch.length === 0) break;

    out.push(...batch);
    if (batch.length < perPage) break;
    page++;
  }

  return out.slice(0, MAX_COMMITS);
}
