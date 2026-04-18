import type { Db } from "@/db/connection.js";
import { RuntimeError } from "@/lib/errors.js";
import { logger } from "@/lib/logger.js";
import type { AIProvider } from "@/ai/provider.js";
import {
  getProjectBySlug,
  listReposForProject,
  type ProjectRow,
} from "@/db/queries.js";
import {
  inferRepo,
  type RepoInference,
} from "@/scanner/query-builder.js";
import { collectRepoActivity } from "@/scanner/repo-activity.js";

export interface ScanResult {
  scanId: number;
  project: ProjectRow;
  inference: RepoInference | null;
  activity: { repoPath: string; commitsInserted: number }[];
  status: "success" | "partial" | "failed";
  costEstimateUSD: number | null;
  error?: string;
}

/**
 * Runs a scan for a single project.
 *
 * Phase 3 scope:
 *   1. Create a scan row (status=running).
 *   2. For each repo: collect git commit activity → repo_activity table.
 *   3. Analyze the first repo (primary): file-summary → AI → project inference.
 *   4. Write ai_summary row, update project.ai_inferred_summary.
 *   5. Mark scan finished.
 *
 * External source scanning (HN/PH/GitHub/web) is Phase 4. "What's new"
 * summaries are Phase 5.
 */
export async function scanProject(opts: {
  db: Db;
  provider: AIProvider;
  projectSlug: string;
  bootstrap?: boolean;
}): Promise<ScanResult> {
  const { db, provider, projectSlug } = opts;

  const project = getProjectBySlug(db, projectSlug);
  if (!project) {
    throw new RuntimeError(`Unknown project: '${projectSlug}'`);
  }
  if (project.hidden === 1) {
    throw new RuntimeError(`Project '${projectSlug}' is hidden in config.`);
  }

  const repos = listReposForProject(db, project.id);
  if (repos.length === 0) {
    throw new RuntimeError(
      `Project '${projectSlug}' has no repos configured.`,
    );
  }

  const firstRepo = repos[0]!;
  const isBootstrap =
    opts.bootstrap === true || repos.every((r) => !r.last_commit_sha_seen);

  // Create scan row — run all activity/inference against its ID.
  const scanStartedAt = new Date().toISOString();
  const scanInsert = db
    .prepare(
      `INSERT INTO scan (repo_id, started_at, status, ai_provider, is_bootstrap)
       VALUES (?, ?, 'running', ?, ?)`,
    )
    .run(firstRepo.id, scanStartedAt, provider.name, isBootstrap ? 1 : 0);
  const scanId = Number(scanInsert.lastInsertRowid);

  const activitySummaries: { repoPath: string; commitsInserted: number }[] = [];
  let inference: RepoInference | null = null;
  let totalCost = 0;
  let partial = false;
  let errorMsg: string | undefined;

  try {
    // Collect activity for every repo in the project.
    for (const repo of repos) {
      try {
        const summary = await collectRepoActivity(
          db,
          scanId,
          repo,
          project.bootstrap_lookback_years,
        );
        activitySummaries.push({
          repoPath: summary.repoPath,
          commitsInserted: summary.commitsInserted,
        });
      } catch (err) {
        partial = true;
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn({ repo: repo.path, err: msg }, "Repo activity failed");
        activitySummaries.push({
          repoPath: repo.path,
          commitsInserted: 0,
        });
      }
    }

    // Run AI inference against the primary repo only (Phase 3).
    try {
      const { inference: inf } = await inferRepo(provider, firstRepo.path);
      inference = inf;
      totalCost += inf.costEstimateUSD ?? 0;

      db.prepare(
        `INSERT INTO ai_summary (scan_id, kind, content_md, created_at)
         VALUES (?, 'project_inference', ?, ?)`,
      ).run(
        scanId,
        JSON.stringify({
          summary: inf.summary,
          search_queries: inf.search_queries,
        }),
        new Date().toISOString(),
      );

      db.prepare(
        `UPDATE project SET ai_inferred_summary = ?, updated_at = ?
         WHERE id = ?`,
      ).run(inf.summary, new Date().toISOString(), project.id);
    } catch (err) {
      partial = true;
      errorMsg = err instanceof Error ? err.message : String(err);
      logger.warn({ err: errorMsg }, "Repo inference failed");
    }
  } finally {
    const finishedAt = new Date().toISOString();
    const status: ScanResult["status"] = errorMsg
      ? inference === null && activitySummaries.length === 0
        ? "failed"
        : "partial"
      : partial
        ? "partial"
        : "success";
    db.prepare(
      `UPDATE scan SET finished_at = ?, status = ?, cost_estimate = ?, error_message = ?
       WHERE id = ?`,
    ).run(finishedAt, status, totalCost || null, errorMsg ?? null, scanId);
  }

  // Reload project to return fresh state
  const updatedProject = getProjectBySlug(db, projectSlug)!;

  return {
    scanId,
    project: updatedProject,
    inference,
    activity: activitySummaries,
    status: errorMsg
      ? inference === null && activitySummaries.length === 0
        ? "failed"
        : "partial"
      : partial
        ? "partial"
        : "success",
    costEstimateUSD: totalCost || null,
    error: errorMsg,
  };
}
