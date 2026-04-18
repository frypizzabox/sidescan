import type { Config } from "@/config/schema.js";
import type { Db } from "@/db/connection.js";
import {
  deleteRepo,
  getProjectBySlug,
  hideProject,
  insertProject,
  insertRepo,
  listProjects,
  listReposForProject,
  updateProject,
  type ProjectRow,
  type UpsertProjectInput,
} from "@/db/queries.js";

export interface ReconcileSummary {
  projectsAdded: number;
  projectsUpdated: number;
  projectsHidden: number;
  projectsUnhidden: number;
  reposAdded: number;
  reposRemoved: number;
}

/**
 * Reconciles the YAML config against the DB.
 * - Adds projects that are in config but not in DB.
 * - Updates projects whose config changed.
 * - Unhides projects that were previously hidden but are back in config.
 * - Hides (soft-delete) projects that are in DB but no longer in config.
 * - Within each project: adds new repos, removes repos no longer listed.
 * Scan history is preserved across all operations; only `sidescan reset` deletes.
 */
export function reconcile(db: Db, config: Config): ReconcileSummary {
  const summary: ReconcileSummary = {
    projectsAdded: 0,
    projectsUpdated: 0,
    projectsHidden: 0,
    projectsUnhidden: 0,
    reposAdded: 0,
    reposRemoved: 0,
  };

  const configSlugs = new Set(config.projects.map((p) => p.slug));

  const tx = db.transaction(() => {
    // Handle each project in the config
    for (const projectCfg of config.projects) {
      const input: UpsertProjectInput = {
        slug: projectCfg.slug,
        name: projectCfg.name,
        description: projectCfg.description ?? null,
        scan_frequency: projectCfg.scan.frequency,
        scan_time: projectCfg.scan.time ?? null,
        bootstrap_lookback_years: projectCfg.bootstrap_lookback_years,
      };

      const existing = getProjectBySlug(db, projectCfg.slug);
      let projectId: number;

      if (!existing) {
        projectId = insertProject(db, input);
        summary.projectsAdded++;
      } else {
        if (needsUpdate(existing, input)) {
          updateProject(db, existing.id, input);
          summary.projectsUpdated++;
        }
        if (existing.hidden === 1) {
          summary.projectsUnhidden++;
        }
        projectId = existing.id;
      }

      reconcileRepos(
        db,
        projectId,
        projectCfg.repos.map((r) => r.path),
        summary,
      );
    }

    // Hide projects that are in DB but no longer in config
    const allProjects = listProjects(db, { includeHidden: true });
    for (const proj of allProjects) {
      if (proj.hidden === 0 && !configSlugs.has(proj.slug)) {
        hideProject(db, proj.id);
        summary.projectsHidden++;
      }
    }
  });
  tx();

  return summary;
}

function needsUpdate(existing: ProjectRow, input: UpsertProjectInput): boolean {
  return (
    existing.name !== input.name ||
    existing.description !== input.description ||
    existing.scan_frequency !== input.scan_frequency ||
    existing.scan_time !== input.scan_time ||
    existing.bootstrap_lookback_years !== input.bootstrap_lookback_years ||
    existing.hidden === 1
  );
}

function reconcileRepos(
  db: Db,
  projectId: number,
  configPaths: string[],
  summary: ReconcileSummary,
): void {
  const configPathSet = new Set(configPaths);
  const existingRepos = listReposForProject(db, projectId);
  const existingPathSet = new Set(existingRepos.map((r) => r.path));

  for (const path of configPaths) {
    if (!existingPathSet.has(path)) {
      insertRepo(db, projectId, path);
      summary.reposAdded++;
    }
  }

  for (const repo of existingRepos) {
    if (!configPathSet.has(repo.path)) {
      deleteRepo(db, repo.id);
      summary.reposRemoved++;
    }
  }
}

export function formatReconcileSummary(s: ReconcileSummary): string {
  const parts: string[] = [];
  if (s.projectsAdded > 0) parts.push(`${s.projectsAdded} added`);
  if (s.projectsUpdated > 0) parts.push(`${s.projectsUpdated} updated`);
  if (s.projectsUnhidden > 0) parts.push(`${s.projectsUnhidden} restored`);
  if (s.projectsHidden > 0) parts.push(`${s.projectsHidden} hidden`);
  if (s.reposAdded > 0) parts.push(`+${s.reposAdded} repos`);
  if (s.reposRemoved > 0) parts.push(`-${s.reposRemoved} repos`);
  return parts.length > 0 ? parts.join(", ") : "no changes";
}
