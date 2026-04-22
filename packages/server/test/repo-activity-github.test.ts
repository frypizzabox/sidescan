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
import { collectGitHubRepoActivity } from "@/scanner/repo-activity-github.js";

const SPEC = {
  type: "github" as const,
  owner: "acme",
  repo: "widget",
  branch: null,
  url: "https://github.com/acme/widget",
};

type MockResponse = { status?: number; body: unknown };

function fetchMock(byPattern: Record<string, MockResponse>): typeof fetch {
  const entries = Object.entries(byPattern).sort(
    (a, b) => b[0].length - a[0].length,
  );
  return (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    for (const [pattern, conf] of entries) {
      if (url.includes(pattern)) {
        return new Response(JSON.stringify(conf.body), {
          status: conf.status ?? 200,
          headers: { "content-type": "application/json" },
        });
      }
    }
    return new Response("[]", {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

describe("collectGitHubRepoActivity", () => {
  let dbDir: string;
  let db: Db;
  let scanId: number;
  let repoId: number;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    dbDir = mkdtempSync(join(tmpdir(), "sidescan-gh-activity-"));
    db = openDb(join(dbDir, "test.db"));
    migrate(db);
    const projectId = insertProject(db, {
      slug: "p",
      name: "P",
      description: null,
      scan_frequency: "manual",
      scan_time: null,
      bootstrap_lookback_years: 2,
    });
    repoId = insertRepo(db, projectId, SPEC.url);
    const scanInsert = db
      .prepare(
        "INSERT INTO scan (repo_id, started_at, status) VALUES (?, ?, 'running')",
      )
      .run(repoId, new Date().toISOString());
    scanId = Number(scanInsert.lastInsertRowid);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    db.close();
    rmSync(dbDir, { recursive: true, force: true });
  });

  function getRepo() {
    return listReposForProject(db, 1)[0]!;
  }

  it("collects commits, releases, issues, and PRs in a single pass", async () => {
    globalThis.fetch = fetchMock({
      "/repos/acme/widget/commits": {
        body: [
          {
            sha: "aaa111",
            html_url: "https://github.com/acme/widget/commit/aaa111",
            commit: {
              message: "feat: add thing\n\nLong body",
              author: { date: "2026-04-01T10:00:00Z" },
              committer: { date: "2026-04-01T10:00:00Z" },
            },
          },
          {
            sha: "bbb222",
            html_url: "https://github.com/acme/widget/commit/bbb222",
            commit: {
              message: "fix: bug",
              author: { date: "2026-03-30T10:00:00Z" },
              committer: { date: "2026-03-30T10:00:00Z" },
            },
          },
        ],
      },
      "/repos/acme/widget/releases": {
        body: [
          {
            id: 1,
            name: "Widget 1.0",
            tag_name: "v1.0.0",
            html_url: "https://github.com/acme/widget/releases/tag/v1.0.0",
            published_at: "2026-04-15T00:00:00Z",
            created_at: "2026-04-15T00:00:00Z",
            draft: false,
          },
        ],
      },
      "/repos/acme/widget/issues": {
        body: [
          {
            number: 42,
            title: "Widget crashes on startup",
            html_url: "https://github.com/acme/widget/issues/42",
            updated_at: "2026-04-18T00:00:00Z",
            created_at: "2026-04-17T00:00:00Z",
          },
        ],
      },
      "/repos/acme/widget/pulls": {
        body: [
          {
            number: 99,
            title: "Refactor widget",
            html_url: "https://github.com/acme/widget/pull/99",
            merged_at: "2026-04-19T00:00:00Z",
            updated_at: "2026-04-19T00:00:00Z",
            created_at: "2026-04-10T00:00:00Z",
          },
        ],
      },
    });

    const summary = await collectGitHubRepoActivity(
      db,
      scanId,
      getRepo(),
      SPEC,
      2,
      null,
    );

    expect(summary.commitsInserted).toBe(2);
    expect(summary.releasesInserted).toBe(1);
    expect(summary.issuesInserted).toBe(1);
    expect(summary.prsInserted).toBe(1);
    expect(summary.isBootstrap).toBe(true);
    expect(summary.latestSha).toBe("aaa111");

    const rows = db
      .prepare<[number], { kind: string; ref: string; title: string }>(
        "SELECT kind, ref, title FROM repo_activity WHERE scan_id = ? ORDER BY kind, ref",
      )
      .all(scanId);

    expect(rows).toEqual([
      { kind: "commit", ref: "aaa111", title: "feat: add thing" },
      { kind: "commit", ref: "bbb222", title: "fix: bug" },
      { kind: "issue", ref: "#42", title: "Widget crashes on startup" },
      { kind: "pr", ref: "#99", title: "Refactor widget" },
      { kind: "release", ref: "v1.0.0", title: "Widget 1.0" },
    ]);
  });

  it("skips draft releases", async () => {
    globalThis.fetch = fetchMock({
      "/repos/acme/widget/commits": { body: [] },
      "/repos/acme/widget/releases": {
        body: [
          {
            id: 1,
            name: "Shipped",
            tag_name: "v1.0.0",
            html_url: "https://github.com/acme/widget/releases/tag/v1.0.0",
            published_at: "2026-04-15T00:00:00Z",
            created_at: "2026-04-15T00:00:00Z",
            draft: false,
          },
          {
            id: 2,
            name: "WIP",
            tag_name: "v2.0.0-draft",
            html_url: "https://github.com/acme/widget/releases/tag/v2.0.0-draft",
            published_at: null,
            created_at: "2026-04-20T00:00:00Z",
            draft: true,
          },
        ],
      },
      "/repos/acme/widget/issues": { body: [] },
      "/repos/acme/widget/pulls": { body: [] },
    });

    const summary = await collectGitHubRepoActivity(
      db,
      scanId,
      getRepo(),
      SPEC,
      2,
      null,
    );

    expect(summary.releasesInserted).toBe(1);
    const refs = db
      .prepare<[number], { ref: string }>(
        "SELECT ref FROM repo_activity WHERE scan_id = ? AND kind = 'release'",
      )
      .all(scanId)
      .map((r) => r.ref);
    expect(refs).toEqual(["v1.0.0"]);
  });

  it("filters PRs out of /issues (they come back from both endpoints)", async () => {
    globalThis.fetch = fetchMock({
      "/repos/acme/widget/commits": { body: [] },
      "/repos/acme/widget/releases": { body: [] },
      "/repos/acme/widget/issues": {
        body: [
          {
            number: 10,
            title: "Real issue",
            html_url: "https://github.com/acme/widget/issues/10",
            updated_at: "2026-04-18T00:00:00Z",
            created_at: "2026-04-17T00:00:00Z",
          },
          {
            number: 99,
            title: "PR masquerading as issue",
            html_url: "https://github.com/acme/widget/pull/99",
            updated_at: "2026-04-19T00:00:00Z",
            created_at: "2026-04-10T00:00:00Z",
            pull_request: {
              url: "https://api.github.com/repos/acme/widget/pulls/99",
            },
          },
        ],
      },
      "/repos/acme/widget/pulls": { body: [] },
    });

    const summary = await collectGitHubRepoActivity(
      db,
      scanId,
      getRepo(),
      SPEC,
      2,
      null,
    );

    expect(summary.issuesInserted).toBe(1);
    const refs = db
      .prepare<[number], { ref: string }>(
        "SELECT ref FROM repo_activity WHERE scan_id = ? AND kind = 'issue'",
      )
      .all(scanId)
      .map((r) => r.ref);
    expect(refs).toEqual(["#10"]);
  });

  it("filters releases older than the lookback window", async () => {
    globalThis.fetch = fetchMock({
      "/repos/acme/widget/commits": { body: [] },
      "/repos/acme/widget/releases": {
        body: [
          {
            id: 1,
            name: "Recent",
            tag_name: "v2.0.0",
            html_url: "https://github.com/acme/widget/releases/tag/v2.0.0",
            published_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            draft: false,
          },
          {
            id: 2,
            name: "Ancient",
            tag_name: "v0.1.0",
            html_url: "https://github.com/acme/widget/releases/tag/v0.1.0",
            published_at: "2015-01-01T00:00:00Z",
            created_at: "2015-01-01T00:00:00Z",
            draft: false,
          },
        ],
      },
      "/repos/acme/widget/issues": { body: [] },
      "/repos/acme/widget/pulls": { body: [] },
    });

    const summary = await collectGitHubRepoActivity(
      db,
      scanId,
      getRepo(),
      SPEC,
      2,
      null,
    );

    expect(summary.releasesInserted).toBe(1);
    const refs = db
      .prepare<[number], { ref: string }>(
        "SELECT ref FROM repo_activity WHERE scan_id = ? AND kind = 'release'",
      )
      .all(scanId)
      .map((r) => r.ref);
    expect(refs).toEqual(["v2.0.0"]);
  });

  it("passes Authorization header when token is provided", async () => {
    let seenAuth: string | null = null;
    globalThis.fetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      const headers = new Headers(init?.headers);
      if (!seenAuth) seenAuth = headers.get("Authorization");
      const url = typeof input === "string" ? input : input.toString();
      return new Response(url.includes("/commits") ? "[]" : "[]", {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    await collectGitHubRepoActivity(
      db,
      scanId,
      getRepo(),
      SPEC,
      2,
      "ghp_test",
    );
    expect(seenAuth).toBe("Bearer ghp_test");
  });

  it("continues when one endpoint fails (logs warn, zero for that kind)", async () => {
    globalThis.fetch = fetchMock({
      "/repos/acme/widget/commits": {
        body: [
          {
            sha: "aaa",
            html_url: "https://github.com/acme/widget/commit/aaa",
            commit: {
              message: "feat",
              author: { date: "2026-04-01T10:00:00Z" },
              committer: { date: "2026-04-01T10:00:00Z" },
            },
          },
        ],
      },
      "/repos/acme/widget/releases": { status: 500, body: "boom" },
      "/repos/acme/widget/issues": { body: [] },
      "/repos/acme/widget/pulls": { body: [] },
    });

    const summary = await collectGitHubRepoActivity(
      db,
      scanId,
      getRepo(),
      SPEC,
      2,
      null,
    );

    expect(summary.commitsInserted).toBe(1);
    expect(summary.releasesInserted).toBe(0);
  });

  it("is idempotent — re-running the same window does not double-insert", async () => {
    const mock = fetchMock({
      "/repos/acme/widget/commits": {
        body: [
          {
            sha: "aaa",
            html_url: "https://github.com/acme/widget/commit/aaa",
            commit: {
              message: "feat",
              author: { date: "2026-04-01T10:00:00Z" },
              committer: { date: "2026-04-01T10:00:00Z" },
            },
          },
        ],
      },
      "/repos/acme/widget/releases": {
        body: [
          {
            id: 1,
            name: null,
            tag_name: "v1.0.0",
            html_url: "https://github.com/acme/widget/releases/tag/v1.0.0",
            published_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            draft: false,
          },
        ],
      },
      "/repos/acme/widget/issues": {
        body: [
          {
            number: 1,
            title: "issue one",
            html_url: "https://github.com/acme/widget/issues/1",
            updated_at: "2026-04-10T00:00:00Z",
            created_at: "2026-04-10T00:00:00Z",
          },
        ],
      },
      "/repos/acme/widget/pulls": {
        body: [
          {
            number: 2,
            title: "pr two",
            html_url: "https://github.com/acme/widget/pull/2",
            merged_at: null,
            updated_at: "2026-04-11T00:00:00Z",
            created_at: "2026-04-11T00:00:00Z",
          },
        ],
      },
    });
    globalThis.fetch = mock;

    const first = await collectGitHubRepoActivity(
      db,
      scanId,
      getRepo(),
      SPEC,
      2,
      null,
    );
    expect(first.commitsInserted).toBe(1);
    expect(first.releasesInserted).toBe(1);
    expect(first.issuesInserted).toBe(1);
    expect(first.prsInserted).toBe(1);

    // New scan, same data
    const scan2 = db
      .prepare(
        "INSERT INTO scan (repo_id, started_at, status) VALUES (?, ?, 'running')",
      )
      .run(repoId, new Date().toISOString());
    const scan2Id = Number(scan2.lastInsertRowid);

    const second = await collectGitHubRepoActivity(
      db,
      scan2Id,
      getRepo(),
      SPEC,
      2,
      null,
    );
    expect(second.releasesInserted).toBe(0);
    expect(second.issuesInserted).toBe(0);
    expect(second.prsInserted).toBe(0);

    const totalRows = db
      .prepare<[number], { n: number }>(
        "SELECT COUNT(*) as n FROM repo_activity WHERE repo_id = ?",
      )
      .get(repoId);
    expect(totalRows?.n).toBe(4);
  });

  it("uses release.name when present, falls back to tag_name", async () => {
    globalThis.fetch = fetchMock({
      "/repos/acme/widget/commits": { body: [] },
      "/repos/acme/widget/releases": {
        body: [
          {
            id: 1,
            name: null,
            tag_name: "v1.0.0",
            html_url: "https://github.com/acme/widget/releases/tag/v1.0.0",
            published_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            draft: false,
          },
        ],
      },
      "/repos/acme/widget/issues": { body: [] },
      "/repos/acme/widget/pulls": { body: [] },
    });

    await collectGitHubRepoActivity(db, scanId, getRepo(), SPEC, 2, null);

    const row = db
      .prepare<[number], { title: string }>(
        "SELECT title FROM repo_activity WHERE scan_id = ? AND kind = 'release'",
      )
      .get(scanId);
    expect(row?.title).toBe("v1.0.0");
  });

  it("PR event_date prefers merged_at over created_at", async () => {
    globalThis.fetch = fetchMock({
      "/repos/acme/widget/commits": { body: [] },
      "/repos/acme/widget/releases": { body: [] },
      "/repos/acme/widget/issues": { body: [] },
      "/repos/acme/widget/pulls": {
        body: [
          {
            number: 5,
            title: "merged pr",
            html_url: "https://github.com/acme/widget/pull/5",
            merged_at: "2026-04-19T00:00:00Z",
            updated_at: "2026-04-19T00:00:00Z",
            created_at: "2026-04-01T00:00:00Z",
          },
        ],
      },
    });

    await collectGitHubRepoActivity(db, scanId, getRepo(), SPEC, 2, null);

    const row = db
      .prepare<[number], { event_date: string }>(
        "SELECT event_date FROM repo_activity WHERE scan_id = ? AND kind = 'pr'",
      )
      .get(scanId);
    expect(row?.event_date).toBe("2026-04-19T00:00:00Z");
  });
});
