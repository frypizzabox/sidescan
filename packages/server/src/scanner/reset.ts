import type { Db } from "@/db/connection.js";
import { RuntimeError } from "@/lib/errors.js";
import { getProjectBySlug } from "@/db/queries.js";

export interface ResetSummary {
  projectSlug: string;
  scansDeleted: number;
}

/**
 * Hard-deletes all scans, findings, repo_activity, and ai_summary rows
 * for a project. `Project` and `Repo` rows stay (they're derived from
 * config.yaml). On next scan the project is treated as a bootstrap.
 */
export function resetProject(db: Db, slug: string): ResetSummary {
  const project = getProjectBySlug(db, slug);
  if (!project) throw new RuntimeError(`Unknown project: '${slug}'`);

  const result = db
    .prepare(
      `DELETE FROM scan
       WHERE repo_id IN (SELECT id FROM repo WHERE project_id = ?)`,
    )
    .run(project.id);

  // scan deletion cascades to finding / repo_activity / ai_summary via
  // ON DELETE CASCADE. We also clear derived state on the repo rows.
  db.prepare(
    `UPDATE repo SET last_scanned_at = NULL, last_commit_sha_seen = NULL,
                     updated_at = ?
     WHERE project_id = ?`,
  ).run(new Date().toISOString(), project.id);

  db.prepare(
    `UPDATE project SET ai_inferred_summary = NULL, updated_at = ?
     WHERE id = ?`,
  ).run(new Date().toISOString(), project.id);

  return { projectSlug: slug, scansDeleted: result.changes };
}
