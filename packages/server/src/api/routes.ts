import { Hono } from "hono";
import type { Db } from "@/db/connection.js";
import {
  getProjectBySlug,
  listProjects,
  listReposForProject,
} from "@/db/queries.js";

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

/**
 * Builds the `/api` router. Everything behind this path is JSON.
 */
export function buildApiRoutes(deps: ApiDeps): Hono {
  const api = new Hono();

  api.get("/health", (c) =>
    c.json({ status: "ok", version: deps.version }),
  );

  api.get("/projects", (c) => {
    const projects = listProjects(deps.db).map(toProjectDto);
    return c.json({ projects });
  });

  api.get("/projects/:slug", (c) => {
    const slug = c.req.param("slug");
    const project = getProjectBySlug(deps.db, slug);
    if (!project || project.hidden === 1) {
      return c.json({ error: "project_not_found", slug }, 404);
    }
    const repos = listReposForProject(deps.db, project.id).map((r) => ({
      id: r.id,
      path: r.path,
      lastScannedAt: r.last_scanned_at,
    }));
    return c.json({ project: toProjectDto(project), repos });
  });

  api.post("/reload", async (c) => {
    if (!deps.onReload) {
      return c.json(
        { ok: false, error: "reload_not_available" },
        503,
      );
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

function toProjectDto(row: ReturnType<typeof listProjects>[number]) {
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
  };
}
