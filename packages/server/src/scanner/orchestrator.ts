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
import { buildSources, type SourceSet } from "@/sources/factory.js";
import { upsertFindings } from "@/db/findings.js";
import type { Config } from "@/config/schema.js";

export interface ScanResult {
  scanId: number;
  project: ProjectRow;
  inference: RepoInference | null;
  activity: { repoPath: string; commitsInserted: number }[];
  findings: {
    source: string;
    found: number;
    inserted: number;
    seenAgain: number;
  }[];
  skippedSources: { name: string; reason: string }[];
  status: "success" | "partial" | "failed";
  costEstimateUSD: number | null;
  error?: string;
}

/**
 * Runs a scan for a single project end-to-end.
 *
 * Flow:
 *   1. Create a scan row (status=running).
 *   2. For each repo: collect git commit activity → repo_activity table.
 *   3. Analyze primary repo → file-summary → AI → project inference + queries.
 *   4. Fan out AI-generated queries to each active source (HN, GitHub, web).
 *   5. Upsert findings with (source, url) dedupe.
 *   6. Mark scan finished.
 */
export async function scanProject(opts: {
  db: Db;
  config: Config;
  provider: AIProvider;
  projectSlug: string;
  bootstrap?: boolean;
  queriesPerSource?: number;
}): Promise<ScanResult> {
  const { db, config, provider, projectSlug } = opts;
  const queriesPerSource = opts.queriesPerSource ?? 4;

  const project = getProjectBySlug(db, projectSlug);
  if (!project) throw new RuntimeError(`Unknown project: '${projectSlug}'`);
  if (project.hidden === 1)
    throw new RuntimeError(`Project '${projectSlug}' is hidden in config.`);

  const repos = listReposForProject(db, project.id);
  if (repos.length === 0) {
    throw new RuntimeError(
      `Project '${projectSlug}' has no repos configured.`,
    );
  }

  const firstRepo = repos[0]!;
  const isBootstrap =
    opts.bootstrap === true || repos.every((r) => !r.last_commit_sha_seen);
  const sources: SourceSet = buildSources(config);

  const scanStartedAt = new Date().toISOString();
  const scanInsert = db
    .prepare(
      `INSERT INTO scan (repo_id, started_at, status, ai_provider, is_bootstrap)
       VALUES (?, ?, 'running', ?, ?)`,
    )
    .run(firstRepo.id, scanStartedAt, provider.name, isBootstrap ? 1 : 0);
  const scanId = Number(scanInsert.lastInsertRowid);

  const activitySummaries: ScanResult["activity"] = [];
  const findingsSummaries: ScanResult["findings"] = [];
  let inference: RepoInference | null = null;
  let totalCost = 0;
  let partial = false;
  let errorMsg: string | undefined;

  try {
    // Step 1: repo activity (all repos)
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

    // Step 2: AI inference on primary repo
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

    // Step 3: fan out queries to sources (only if inference succeeded)
    if (inference) {
      const queries = inference.search_queries.slice(0, queriesPerSource);
      for (const src of sources.active) {
        try {
          const found = await src.search({ queries, perQueryLimit: 10 });
          const upsert = upsertFindings(db, scanId, found);
          findingsSummaries.push({
            source: src.name,
            found: found.length,
            inserted: upsert.inserted,
            seenAgain: upsert.seenAgain,
          });
        } catch (err) {
          partial = true;
          const msg = err instanceof Error ? err.message : String(err);
          logger.warn(
            { source: src.name, err: msg },
            "Source search failed",
          );
          findingsSummaries.push({
            source: src.name,
            found: 0,
            inserted: 0,
            seenAgain: 0,
          });
        }
      }
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

  const updatedProject = getProjectBySlug(db, projectSlug)!;

  return {
    scanId,
    project: updatedProject,
    inference,
    activity: activitySummaries,
    findings: findingsSummaries,
    skippedSources: sources.skipped,
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
