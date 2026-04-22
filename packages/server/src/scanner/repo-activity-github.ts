import { logger } from "@/lib/logger.js";
import type { Db } from "@/db/connection.js";
import type { RepoRow } from "@/db/queries.js";
import type { RepoSpec } from "@/scanner/repo-spec.js";
import type { RepoActivitySummary } from "@/scanner/repo-activity.js";

const GH_API = "https://api.github.com";
const MAX_COMMITS = 200;
const MAX_RELEASES = 60;
const MAX_ISSUES = 200;
const MAX_PULLS = 200;

interface GitHubCommitResponse {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author: { date: string };
    committer: { date: string };
  };
}

interface GitHubReleaseResponse {
  id: number;
  name: string | null;
  tag_name: string;
  html_url: string;
  published_at: string | null;
  created_at: string;
  draft: boolean;
}

interface GitHubIssueResponse {
  number: number;
  title: string;
  html_url: string;
  updated_at: string;
  created_at: string;
  pull_request?: unknown;
}

interface GitHubPullResponse {
  number: number;
  title: string;
  html_url: string;
  merged_at: string | null;
  created_at: string;
}

/**
 * Collects recent activity (commits, releases, issues, PRs) for a
 * GitHub-hosted repo via the REST API and writes them to repo_activity.
 * Dedup is handled by the UNIQUE (repo_id, kind, ref) constraint +
 * INSERT OR IGNORE, so we can safely re-scan the same window.
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

  const [commits, releases, issues, pulls] = await Promise.all([
    fetchCommits({
      owner: spec.owner,
      repo: spec.repo,
      branch: spec.branch,
      since: sinceISO,
      headers,
    }),
    fetchReleases({ owner: spec.owner, repo: spec.repo, headers }),
    fetchIssues({
      owner: spec.owner,
      repo: spec.repo,
      since: sinceISO,
      headers,
    }),
    fetchPulls({
      owner: spec.owner,
      repo: spec.repo,
      since: sinceISO,
      headers,
    }),
  ]);

  // Client-side time filter for releases (API has no `since`).
  const sinceMs = Date.parse(sinceISO);
  const relevantReleases = releases.filter((r) => {
    if (r.draft) return false;
    const d = r.published_at ?? r.created_at;
    return Date.parse(d) >= sinceMs;
  });

  // Commits: stop at last seen SHA for incremental scans.
  let relevantCommits: GitHubCommitResponse[] = commits;
  if (repo.last_commit_sha_seen) {
    const idx = commits.findIndex(
      (c) => c.sha === repo.last_commit_sha_seen,
    );
    if (idx >= 0) relevantCommits = commits.slice(0, idx);
  }

  const nowISO = new Date().toISOString();
  const insertStmt = db.prepare(
    `INSERT OR IGNORE INTO repo_activity
      (scan_id, repo_id, kind, ref, title, event_date, url, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const counts = { commits: 0, releases: 0, issues: 0, prs: 0 };
  const insertTx = db.transaction(() => {
    for (const c of relevantCommits) {
      const title = c.commit.message.split("\n")[0]!;
      const eventDate = c.commit.committer.date ?? c.commit.author.date;
      const result = insertStmt.run(
        scanId,
        repo.id,
        "commit",
        c.sha,
        title,
        eventDate,
        c.html_url,
        nowISO,
      );
      if (result.changes > 0) counts.commits++;
    }

    for (const r of relevantReleases) {
      const title = r.name ?? r.tag_name;
      const eventDate = r.published_at ?? r.created_at;
      const result = insertStmt.run(
        scanId,
        repo.id,
        "release",
        r.tag_name,
        title,
        eventDate,
        r.html_url,
        nowISO,
      );
      if (result.changes > 0) counts.releases++;
    }

    for (const i of issues) {
      const result = insertStmt.run(
        scanId,
        repo.id,
        "issue",
        `#${i.number}`,
        i.title,
        i.created_at,
        i.html_url,
        nowISO,
      );
      if (result.changes > 0) counts.issues++;
    }

    for (const p of pulls) {
      const eventDate = p.merged_at ?? p.created_at;
      const result = insertStmt.run(
        scanId,
        repo.id,
        "pr",
        `#${p.number}`,
        p.title,
        eventDate,
        p.html_url,
        nowISO,
      );
      if (result.changes > 0) counts.prs++;
    }
  });
  insertTx();

  const latestSha = relevantCommits[0]?.sha ?? repo.last_commit_sha_seen ?? null;
  db.prepare(
    `UPDATE repo SET last_commit_sha_seen = ?, last_scanned_at = ?, updated_at = ?
     WHERE id = ?`,
  ).run(latestSha, nowISO, nowISO, repo.id);

  return {
    repoPath: spec.url,
    commitsRead: relevantCommits.length,
    commitsInserted: counts.commits,
    releasesInserted: counts.releases,
    issuesInserted: counts.issues,
    prsInserted: counts.prs,
    latestSha,
    isBootstrap,
  };
}

function computeSinceISO(repo: RepoRow, lookbackYears: number): string {
  if (repo.last_commit_sha_seen && repo.last_scanned_at) {
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

    const batch = await fetchJsonArray<GitHubCommitResponse>(
      url,
      opts.headers,
      "commits",
    );
    if (batch === null) break;
    out.push(...batch);
    if (batch.length < perPage) break;
    page++;
  }

  return out.slice(0, MAX_COMMITS);
}

async function fetchReleases(opts: {
  owner: string;
  repo: string;
  headers: Record<string, string>;
}): Promise<GitHubReleaseResponse[]> {
  const url = `${GH_API}/repos/${opts.owner}/${opts.repo}/releases?per_page=${MAX_RELEASES}`;
  const batch = await fetchJsonArray<GitHubReleaseResponse>(
    url,
    opts.headers,
    "releases",
  );
  return batch ?? [];
}

async function fetchIssues(opts: {
  owner: string;
  repo: string;
  since: string;
  headers: Record<string, string>;
}): Promise<GitHubIssueResponse[]> {
  const out: GitHubIssueResponse[] = [];
  let page = 1;
  const perPage = 100;
  const maxPages = Math.ceil(MAX_ISSUES / perPage);

  while (page <= maxPages) {
    const params = new URLSearchParams({
      state: "all",
      since: opts.since,
      per_page: String(perPage),
      page: String(page),
    });
    const url = `${GH_API}/repos/${opts.owner}/${opts.repo}/issues?${params.toString()}`;
    const batch = await fetchJsonArray<GitHubIssueResponse>(
      url,
      opts.headers,
      "issues",
    );
    if (batch === null) break;
    out.push(...batch);
    if (batch.length < perPage) break;
    page++;
  }

  // /issues returns PRs too — strip them.
  return out.filter((i) => !i.pull_request).slice(0, MAX_ISSUES);
}

async function fetchPulls(opts: {
  owner: string;
  repo: string;
  since: string;
  headers: Record<string, string>;
}): Promise<GitHubPullResponse[]> {
  const out: GitHubPullResponse[] = [];
  let page = 1;
  const perPage = 100;
  const maxPages = Math.ceil(MAX_PULLS / perPage);
  const sinceMs = Date.parse(opts.since);

  while (page <= maxPages) {
    const params = new URLSearchParams({
      state: "all",
      sort: "updated",
      direction: "desc",
      per_page: String(perPage),
      page: String(page),
    });
    const url = `${GH_API}/repos/${opts.owner}/${opts.repo}/pulls?${params.toString()}`;
    const batch = await fetchJsonArray<
      GitHubPullResponse & { updated_at: string }
    >(url, opts.headers, "pulls");
    if (batch === null) break;

    // The /pulls endpoint lacks a `since` param, so filter client-side
    // on updated_at and stop once we fall past the cutoff.
    let stopped = false;
    for (const p of batch) {
      if (Date.parse(p.updated_at) < sinceMs) {
        stopped = true;
        break;
      }
      out.push(p);
    }
    if (stopped || batch.length < perPage) break;
    page++;
  }

  return out.slice(0, MAX_PULLS);
}

async function fetchJsonArray<T>(
  url: string,
  headers: Record<string, string>,
  kindForLog: string,
): Promise<T[] | null> {
  let res: Response;
  try {
    res = await fetch(url, { headers });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ url, err: msg }, `GitHub ${kindForLog} fetch errored`);
    return null;
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    logger.warn(
      { url, status: res.status, body: body.slice(0, 200) },
      `GitHub ${kindForLog} fetch failed`,
    );
    return null;
  }
  const batch = (await res.json()) as T[];
  if (!Array.isArray(batch)) return null;
  return batch;
}
