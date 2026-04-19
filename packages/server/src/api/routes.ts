import { Hono } from "hono";
import type { Db } from "@/db/connection.js";
import {
  getProjectBySlug,
  listProjects,
  listReposForProject,
  type ProjectRow,
} from "@/db/queries.js";
import {
  listFindingsForProject,
  countNewFindingsSince,
  getLatestScanIdForProject,
  dismissFinding,
  markFindingRead,
  markFindingUnread,
  markActivityRead,
  markActivityUnread,
  type FindingRow,
} from "@/db/findings.js";
import { githubRepoKey } from "@/lib/github-url.js";

export interface ApiDeps {
  db: Db;
  version: string;
  onReload?: () => Promise<ReloadResult> | ReloadResult;
}

export interface ReloadResult {
  ok: boolean;
  summary?: string;
  error?: string;
}

export function buildApiRoutes(deps: ApiDeps): Hono {
  const api = new Hono();

  api.get("/health", (c) =>
    c.json({ status: "ok", version: deps.version }),
  );

  api.get("/projects", (c) => {
    const projects = listProjects(deps.db).map((p) =>
      toProjectDto(deps.db, p),
    );
    return c.json({ projects });
  });

  api.get("/projects/:slug", (c) => {
    const slug = c.req.param("slug");
    const project = getProjectBySlug(deps.db, slug);
    if (!project || project.hidden === 1) {
      return c.json({ error: "project_not_found", slug }, 404);
    }
    const repos = listReposForProject(deps.db, project.id).map((r) => {
      const commitCount = deps.db
        .prepare<[number], { c: number }>(
          "SELECT COUNT(*) AS c FROM repo_activity WHERE repo_id = ?",
        )
        .get(r.id)?.c ?? 0;
      return {
        id: r.id,
        path: r.path,
        branch: r.branch,
        lastScannedAt: r.last_scanned_at,
        commitCount,
        githubKey: githubRepoKey(r.path),
      };
    });
    const scans = deps.db
      .prepare<
        [number],
        {
          id: number;
          started_at: string;
          finished_at: string | null;
          status: "running" | "success" | "partial" | "failed";
          cost_estimate: number | null;
          is_bootstrap: number;
        }
      >(
        `SELECT s.id, s.started_at, s.finished_at, s.status, s.cost_estimate, s.is_bootstrap
         FROM scan s JOIN repo r ON s.repo_id = r.id
         WHERE r.project_id = ?
         ORDER BY s.started_at DESC
         LIMIT 5`,
      )
      .all(project.id)
      .map((s) => ({
        id: s.id,
        startedAt: s.started_at,
        finishedAt: s.finished_at,
        status: s.status,
        costEstimateUSD: s.cost_estimate,
        isBootstrap: s.is_bootstrap === 1,
        newFindings: countNewFindingsSince(deps.db, project.id, s.id),
      }));
    return c.json({
      project: toProjectDto(deps.db, project),
      repos,
      latestScan: latestScanDto(deps.db, project.id),
      scans,
    });
  });

  api.get("/projects/:slug/findings", (c) => {
    const slug = c.req.param("slug");
    const project = getProjectBySlug(deps.db, slug);
    if (!project || project.hidden === 1) {
      return c.json({ error: "project_not_found", slug }, 404);
    }
    const tabParam = c.req.query("tab");
    const tab =
      tabParam === "news" || tabParam === "github" ? tabParam : undefined;
    const limit = Math.min(
      Math.max(parseInt(c.req.query("limit") ?? "100", 10) || 100, 1),
      500,
    );
    const latestScanId = getLatestScanIdForProject(deps.db, project.id);
    const rows = listFindingsForProject(deps.db, project.id, { tab, limit });
    const ownRepoKeys = new Set<string>();
    for (const r of listReposForProject(deps.db, project.id)) {
      const key = githubRepoKey(r.path);
      if (key) ownRepoKeys.add(key);
    }
    const filtered = rows.filter((r) => {
      if (r.source !== "github_similar") return true;
      const key = githubRepoKey(r.url);
      return !(key && ownRepoKeys.has(key));
    });
    return c.json({
      findings: filtered.map((r) => findingDto(r, latestScanId)),
    });
  });

  api.post("/findings/:id/read", (c) => {
    const id = parseInt(c.req.param("id"), 10);
    if (!Number.isFinite(id)) return c.json({ error: "invalid_id" }, 400);
    const changes = markFindingRead(deps.db, id);
    if (changes === 0) return c.json({ error: "not_found" }, 404);
    return c.json({ ok: true });
  });

  api.post("/findings/:id/unread", (c) => {
    const id = parseInt(c.req.param("id"), 10);
    if (!Number.isFinite(id)) return c.json({ error: "invalid_id" }, 400);
    const changes = markFindingUnread(deps.db, id);
    if (changes === 0) return c.json({ error: "not_found" }, 404);
    return c.json({ ok: true });
  });

  api.post("/activity/:id/read", (c) => {
    const id = parseInt(c.req.param("id"), 10);
    if (!Number.isFinite(id)) return c.json({ error: "invalid_id" }, 400);
    const changes = markActivityRead(deps.db, id);
    if (changes === 0) return c.json({ error: "not_found" }, 404);
    return c.json({ ok: true });
  });

  api.post("/activity/:id/unread", (c) => {
    const id = parseInt(c.req.param("id"), 10);
    if (!Number.isFinite(id)) return c.json({ error: "invalid_id" }, 400);
    const changes = markActivityUnread(deps.db, id);
    if (changes === 0) return c.json({ error: "not_found" }, 404);
    return c.json({ ok: true });
  });

  api.post("/findings/:id/dismiss", (c) => {
    const id = parseInt(c.req.param("id"), 10);
    if (!Number.isFinite(id)) {
      return c.json({ error: "invalid_id" }, 400);
    }
    const changes = dismissFinding(deps.db, id);
    if (changes === 0) {
      return c.json({ error: "not_found" }, 404);
    }
    return c.json({ ok: true });
  });

  api.get("/projects/:slug/repo-activity", (c) => {
    const slug = c.req.param("slug");
    const project = getProjectBySlug(deps.db, slug);
    if (!project || project.hidden === 1) {
      return c.json({ error: "project_not_found", slug }, 404);
    }
    const limit = Math.min(
      Math.max(parseInt(c.req.query("limit") ?? "100", 10) || 100, 1),
      500,
    );
    const rows = deps.db
      .prepare<
        [number, number],
        {
          id: number;
          kind: "commit" | "release" | "issue" | "pr";
          ref: string;
          title: string;
          event_date: string;
          url: string | null;
          repo_id: number;
          read_at: string | null;
          scan_id: number;
        }
      >(
        `SELECT a.id, a.kind, a.ref, a.title, a.event_date, a.url, a.repo_id,
                a.read_at, a.scan_id
         FROM repo_activity a
         JOIN repo r ON a.repo_id = r.id
         WHERE r.project_id = ?
         ORDER BY a.event_date DESC
         LIMIT ?`,
      )
      .all(project.id, limit);
    const latestScanId = getLatestScanIdForProject(deps.db, project.id);
    return c.json({
      activity: rows.map((a) => ({
        id: a.id,
        kind: a.kind,
        ref: a.ref,
        title: a.title,
        event_date: a.event_date,
        url: a.url,
        repo_id: a.repo_id,
        readAt: a.read_at,
        isNew: latestScanId != null && a.scan_id === latestScanId,
      })),
    });
  });

  // Unified feed — findings + repo activity, sorted by event date desc.
  // Replaces client-side merging in Timeline for the Feed tab.
  api.get("/projects/:slug/feed", (c) => {
    const slug = c.req.param("slug");
    const project = getProjectBySlug(deps.db, slug);
    if (!project || project.hidden === 1) {
      return c.json({ error: "project_not_found", slug }, 404);
    }
    const limit = Math.min(
      Math.max(parseInt(c.req.query("limit") ?? "200", 10) || 200, 1),
      1000,
    );
    const latestScanId = getLatestScanIdForProject(deps.db, project.id);

    const findings = listFindingsForProject(deps.db, project.id, {
      tab: "news",
      limit,
    });
    const activity = deps.db
      .prepare<
        [number, number],
        {
          id: number;
          kind: "commit" | "release" | "issue" | "pr";
          ref: string;
          title: string;
          event_date: string;
          url: string | null;
          read_at: string | null;
          scan_id: number;
        }
      >(
        `SELECT a.id, a.kind, a.ref, a.title, a.event_date, a.url, a.read_at, a.scan_id
         FROM repo_activity a
         JOIN repo r ON a.repo_id = r.id
         WHERE r.project_id = ?
         ORDER BY a.event_date DESC
         LIMIT ?`,
      )
      .all(project.id, limit);

    type Entry =
      | {
          kind: "finding";
          id: number;
          eventDate: string;
          finding: ReturnType<typeof findingDto>;
        }
      | {
          kind: "commit" | "release" | "issue" | "pr";
          id: number;
          eventDate: string;
          activity: {
            id: number;
            kind: "commit" | "release" | "issue" | "pr";
            ref: string;
            title: string;
            event_date: string;
            url: string | null;
            readAt: string | null;
            isNew: boolean;
          };
        };

    const entries: Entry[] = [];
    for (const f of findings) {
      entries.push({
        kind: "finding",
        id: f.id,
        eventDate: f.event_date ?? f.created_at,
        finding: findingDto(f, latestScanId),
      });
    }
    for (const a of activity) {
      entries.push({
        kind: a.kind,
        id: a.id,
        eventDate: a.event_date,
        activity: {
          id: a.id,
          kind: a.kind,
          ref: a.ref,
          title: a.title,
          event_date: a.event_date,
          url: a.url,
          readAt: a.read_at,
          isNew: latestScanId != null && a.scan_id === latestScanId,
        },
      });
    }
    entries.sort((a, b) =>
      a.eventDate < b.eventDate ? 1 : a.eventDate > b.eventDate ? -1 : 0,
    );

    return c.json({ entries: entries.slice(0, limit) });
  });

  api.get("/projects/:slug/whats-new", (c) => {
    const slug = c.req.param("slug");
    const project = getProjectBySlug(deps.db, slug);
    if (!project || project.hidden === 1) {
      return c.json({ error: "project_not_found", slug }, 404);
    }
    const latestScanId = getLatestScanIdForProject(deps.db, project.id);
    if (!latestScanId) return c.json({ content: null });
    const row = deps.db
      .prepare<
        [number],
        { content_md: string; created_at: string }
      >(
        `SELECT content_md, created_at FROM ai_summary
         WHERE scan_id = ? AND kind = 'whats_new'
         ORDER BY id DESC LIMIT 1`,
      )
      .get(latestScanId);
    return c.json({
      content: row?.content_md ?? null,
      createdAt: row?.created_at ?? null,
      scanId: latestScanId,
      newCount: countNewFindingsSince(deps.db, project.id, latestScanId),
    });
  });

  api.get("/across", (c) => {
    // Across-projects "new this week" feed.
    const days = Math.min(
      Math.max(parseInt(c.req.query("days") ?? "7", 10) || 7, 1),
      90,
    );
    const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
    const rows = deps.db
      .prepare<
        [string],
        {
          id: number;
          source: string;
          url: string;
          title: string;
          snippet: string | null;
          event_date: string | null;
          relevance_score: number | null;
          project_slug: string;
          project_name: string;
          created_at: string;
        }
      >(
        `SELECT f.id, f.source, f.url, f.title, f.snippet, f.event_date,
                f.relevance_score, p.slug AS project_slug, p.name AS project_name,
                f.created_at
         FROM finding f
         JOIN scan s ON f.scan_id = s.id
         JOIN repo r ON s.repo_id = r.id
         JOIN project p ON r.project_id = p.id
         WHERE p.hidden = 0
           AND f.dismissed = 0
           AND f.created_at >= ?
         ORDER BY COALESCE(f.relevance_score, 0) DESC,
                  COALESCE(f.event_date, f.created_at) DESC
         LIMIT 100`,
      )
      .all(cutoff);
    return c.json({
      days,
      findings: rows.map((r) => ({
        id: r.id,
        source: r.source,
        url: r.url,
        title: r.title,
        snippet: r.snippet,
        eventDate: r.event_date,
        relevanceScore: r.relevance_score,
        projectSlug: r.project_slug,
        projectName: r.project_name,
      })),
    });
  });

  api.get("/projects/:slug/scans/:scanId", (c) => {
    const slug = c.req.param("slug");
    const scanId = parseInt(c.req.param("scanId"), 10);
    if (!Number.isFinite(scanId)) {
      return c.json({ error: "invalid_scan_id" }, 400);
    }
    const project = getProjectBySlug(deps.db, slug);
    if (!project || project.hidden === 1) {
      return c.json({ error: "project_not_found", slug }, 404);
    }
    const scan = deps.db
      .prepare<
        [number, number],
        {
          id: number;
          started_at: string;
          finished_at: string | null;
          status: string;
          ai_provider: string | null;
          cost_estimate: number | null;
          is_bootstrap: number;
          error_message: string | null;
        }
      >(
        `SELECT s.id, s.started_at, s.finished_at, s.status, s.ai_provider,
                s.cost_estimate, s.is_bootstrap, s.error_message
         FROM scan s
         JOIN repo r ON s.repo_id = r.id
         WHERE s.id = ? AND r.project_id = ?`,
      )
      .get(scanId, project.id);
    if (!scan) return c.json({ error: "scan_not_found" }, 404);

    const findings = deps.db
      .prepare<
        [number, number],
        {
          id: number;
          source: string;
          tab: string;
          url: string;
          title: string;
          snippet: string | null;
          event_date: string | null;
          first_seen_scan_id: number;
          relevance_score: number | null;
          dismissed: number;
        }
      >(
        `SELECT id, source, tab, url, title, snippet, event_date,
                first_seen_scan_id, relevance_score, dismissed
         FROM finding
         WHERE scan_id = ? OR last_seen_scan_id = ?
         ORDER BY COALESCE(relevance_score, 0) DESC`,
      )
      .all(scanId, scanId);

    const activity = deps.db
      .prepare<
        [number],
        {
          id: number;
          kind: string;
          ref: string;
          title: string;
          event_date: string;
        }
      >(
        `SELECT id, kind, ref, title, event_date
         FROM repo_activity WHERE scan_id = ?
         ORDER BY event_date DESC`,
      )
      .all(scanId);

    return c.json({
      scan: {
        id: scan.id,
        startedAt: scan.started_at,
        finishedAt: scan.finished_at,
        status: scan.status,
        aiProvider: scan.ai_provider,
        costEstimateUSD: scan.cost_estimate,
        isBootstrap: scan.is_bootstrap === 1,
        errorMessage: scan.error_message,
      },
      findings,
      activity,
    });
  });

  // GitHub avatar proxy — fetches github.com/{owner}.png server-side and
  // strips Set-Cookie. Without this, GitHub's Set-Cookie headers trigger
  // browser console warnings about rejected cross-site cookies. Proxied
  // images look same-origin to the browser, so no warnings, no drama.
  api.get("/avatar/:owner", async (c) => {
    const owner = c.req.param("owner");
    // Conservative allowlist — GitHub usernames are alphanumeric + hyphen,
    // 1..39 chars. Anything else is a bad request.
    if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(owner)) {
      return c.json({ error: "invalid_owner" }, 400);
    }
    const size = parseInt(c.req.query("size") ?? "80", 10);
    const clampedSize = Math.min(Math.max(Number.isFinite(size) ? size : 80, 16), 460);

    try {
      const res = await fetch(
        `https://github.com/${owner}.png?size=${clampedSize}`,
        {
          redirect: "follow",
          headers: { "User-Agent": "sidescan/0.1" },
        },
      );
      if (!res.ok || !res.body) {
        return c.json({ error: "upstream", status: res.status }, 502);
      }
      const buf = await res.arrayBuffer();
      return new Response(buf, {
        status: 200,
        headers: {
          "Content-Type": res.headers.get("Content-Type") ?? "image/png",
          // Cache aggressively — avatars change rarely; mtime update triggers
          // a new URL in practice because sizes cache-bust via query.
          "Cache-Control": "public, max-age=86400",
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: "fetch_failed", message: msg }, 502);
    }
  });

  api.post("/reload", async (c) => {
    if (!deps.onReload) {
      return c.json({ ok: false, error: "reload_not_available" }, 503);
    }
    try {
      const result = await deps.onReload();
      return c.json(result, result.ok ? 200 : 400);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ ok: false, error: msg }, 500);
    }
  });

  return api;
}

function findingDto(r: FindingRow, latestScanId: number | null) {
  return {
    id: r.id,
    source: r.source,
    tab: r.tab,
    url: r.url,
    title: r.title,
    snippet: r.snippet,
    eventDate: r.event_date,
    firstSeenScanId: r.first_seen_scan_id,
    lastSeenScanId: r.last_seen_scan_id,
    similarityScore: r.similarity_score,
    relevanceScore: r.relevance_score,
    isNew: latestScanId != null && r.first_seen_scan_id === latestScanId,
    readAt: r.read_at,
    thumbnailUrl: r.thumbnail_url,
    faviconUrl: r.favicon_url,
    points: r.points,
    comments: r.comments,
    owner: r.owner,
    repoName: r.repo_name,
    description: r.description,
    stars: r.stars,
    language: r.language,
    lastPushedAt: r.last_pushed_at,
  };
}

function toProjectDto(db: Db, row: ProjectRow) {
  const latestScanId = getLatestScanIdForProject(db, row.id);
  const newFindingsSinceLastScan = latestScanId
    ? countNewFindingsSince(db, row.id, latestScanId)
    : 0;
  return {
    slug: row.slug,
    name: row.name,
    description: row.description,
    aiInferredSummary: row.ai_inferred_summary,
    scan: {
      frequency: row.scan_frequency,
      time: row.scan_time,
    },
    bootstrapLookbackYears: row.bootstrap_lookback_years,
    lastScanId: latestScanId,
    newFindingsSinceLastScan,
  };
}

function latestScanDto(db: Db, projectId: number) {
  const id = getLatestScanIdForProject(db, projectId);
  if (!id) return null;
  const row = db
    .prepare<
      [number],
      {
        id: number;
        started_at: string;
        finished_at: string | null;
        status: string;
        cost_estimate: number | null;
        is_bootstrap: number;
      }
    >(
      `SELECT id, started_at, finished_at, status, cost_estimate, is_bootstrap
       FROM scan WHERE id = ?`,
    )
    .get(id);
  if (!row) return null;
  return {
    id: row.id,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    status: row.status,
    costEstimateUSD: row.cost_estimate,
    isBootstrap: row.is_bootstrap === 1,
    newFindings: countNewFindingsSince(db, projectId, row.id),
  };
}
