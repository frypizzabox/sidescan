import type { Command } from "commander";
import { createInterface } from "node:readline/promises";
import { configPath, dbPath } from "@/lib/paths.js";
import { exitCodeFor } from "@/lib/errors.js";
import { loadConfig } from "@/config/parse.js";
import { loadEnvFile } from "@/config/resolve-env.js";
import { reconcile } from "@/config/reconcile.js";
import { openDb } from "@/db/connection.js";
import { migrate } from "@/db/migrate.js";
import { resetProject } from "@/scanner/reset.js";
import { getProjectBySlug, listProjects } from "@/db/queries.js";

export function registerReset(program: Command): void {
  program
    .command("reset <project-slug>")
    .description("Hard-delete a project's scan history and re-bootstrap on next scan")
    .option("-y, --yes", "skip confirmation prompt")
    .action(async (slug: string, opts: { yes?: boolean }) => {
      try {
        loadEnvFile();
        const config = loadConfig(configPath());
        const db = openDb(dbPath());
        migrate(db);
        reconcile(db, config);

        const project = getProjectBySlug(db, slug);
        if (!project) {
          const known = listProjects(db).map((p) => p.slug).join(", ");
          console.error(
            `Unknown project: '${slug}'. Known: ${known || "(none)"}`,
          );
          process.exit(2);
        }

        const counts = {
          scans: count(db, "scan", project.id),
          findings: countFindings(db, project.id),
          activity: countActivity(db, project.id),
        };

        console.log(
          `This will permanently delete:\n  ${counts.scans} scans\n  ${counts.findings} findings\n  ${counts.activity} repo activity rows\nfor project '${slug}'.`,
        );

        if (!opts.yes) {
          const rl = createInterface({
            input: process.stdin,
            output: process.stdout,
          });
          const answer = await rl.question("Continue? [y/N] ");
          rl.close();
          if (answer.trim().toLowerCase() !== "y") {
            console.log("Cancelled. No changes.");
            return;
          }
        }

        const summary = resetProject(db, slug);
        console.log(
          `\u2713 Reset complete. ${summary.scansDeleted} scans removed. Next scan will bootstrap using ${project.bootstrap_lookback_years}-year lookback.`,
        );
        db.close();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(msg);
        process.exit(exitCodeFor(err));
      }
    });
}

function count(db: ReturnType<typeof openDb>, table: string, projectId: number): number {
  const row = db
    .prepare<[number], { c: number }>(
      `SELECT COUNT(*) AS c FROM ${table}
       WHERE repo_id IN (SELECT id FROM repo WHERE project_id = ?)`,
    )
    .get(projectId);
  return row?.c ?? 0;
}

function countFindings(db: ReturnType<typeof openDb>, projectId: number): number {
  const row = db
    .prepare<[number], { c: number }>(
      `SELECT COUNT(*) AS c FROM finding f
       JOIN scan s ON f.scan_id = s.id
       JOIN repo r ON s.repo_id = r.id
       WHERE r.project_id = ?`,
    )
    .get(projectId);
  return row?.c ?? 0;
}

function countActivity(db: ReturnType<typeof openDb>, projectId: number): number {
  const row = db
    .prepare<[number], { c: number }>(
      `SELECT COUNT(*) AS c FROM repo_activity
       WHERE repo_id IN (SELECT id FROM repo WHERE project_id = ?)`,
    )
    .get(projectId);
  return row?.c ?? 0;
}
