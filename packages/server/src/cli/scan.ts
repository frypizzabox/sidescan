import type { Command } from "commander";
import { configPath, dbPath } from "@/lib/paths.js";
import { exitCodeFor } from "@/lib/errors.js";
import { loadConfig } from "@/config/parse.js";
import { loadEnvFile } from "@/config/resolve-env.js";
import { reconcile } from "@/config/reconcile.js";
import { openDb } from "@/db/connection.js";
import { migrate } from "@/db/migrate.js";
import { createAIProvider } from "@/ai/factory.js";
import { scanProject } from "@/scanner/orchestrator.js";
import { listProjects, type ProjectRow } from "@/db/queries.js";

export interface ScanTargetOptions {
  slug?: string;
  all?: boolean;
}

/**
 * Picks which projects a `sidescan scan` invocation should hit.
 *
 * - With a slug: exactly that project (or empty if unknown).
 * - With --all: every project, including frequency=manual ones.
 * - Default: every non-manual project (the scheduler contract).
 */
export function selectScanTargets(
  projects: ProjectRow[],
  opts: ScanTargetOptions,
): ProjectRow[] {
  if (opts.slug) return projects.filter((p) => p.slug === opts.slug);
  if (opts.all) return projects;
  return projects.filter((p) => p.scan_frequency !== "manual");
}

export function registerScan(program: Command): void {
  program
    .command("scan [project-slug]")
    .description("Scan a project (or all non-manual projects) for new findings")
    .option("--bootstrap", "treat as a bootstrap scan (uses lookback_years)")
    .option(
      "--all",
      "include frequency=manual projects (useful for post-upgrade re-scans)",
    )
    .option("--verbose", "debug logging")
    .action(
      async (
        slug: string | undefined,
        opts: { bootstrap?: boolean; all?: boolean; verbose?: boolean },
      ) => {
        try {
          loadEnvFile();
          const config = loadConfig(configPath());
          const db = openDb(dbPath());
          migrate(db);
          reconcile(db, config);

          const provider = createAIProvider(config);

          const all = listProjects(db);
          const targets = selectScanTargets(all, { slug, all: opts.all });

          if (targets.length === 0) {
            if (slug) {
              console.error(
                `Unknown project: '${slug}'. Known: ${all.map((p) => p.slug).join(", ") || "(none)"}`,
              );
              process.exit(2);
            }
            console.log(
              "No projects to scan (all are frequency=manual). Pass --all to include them.",
            );
            return;
          }

          console.log(
            `\u2192 Scanning ${targets.length} project${targets.length === 1 ? "" : "s"}${opts.bootstrap ? " (bootstrap)" : ""}`,
          );

          for (const project of targets) {
            console.log("");
            console.log(`[${project.slug}] starting scan`);
            const result = await scanProject({
              db,
              config,
              provider,
              projectSlug: project.slug,
              bootstrap: opts.bootstrap,
            });

            for (const a of result.activity) {
              const parts = [`${a.commitsInserted} commits`];
              if (a.releasesInserted > 0) parts.push(`${a.releasesInserted} releases`);
              if (a.issuesInserted > 0) parts.push(`${a.issuesInserted} issues`);
              if (a.prsInserted > 0) parts.push(`${a.prsInserted} PRs`);
              console.log(
                `  ${project.slug}   activity: ${parts.join(", ")} (${a.repoPath})`,
              );
            }

            if (result.inference) {
              console.log(
                `  ${project.slug}   inference: ${result.inference.search_queries.length} queries, ${result.inference.inputTokens} in / ${result.inference.outputTokens} out`,
              );
            }

            for (const f of result.findings) {
              console.log(
                `  ${project.slug}   ${f.source.padEnd(15)} ${f.found} found, ${f.inserted} new, ${f.seenAgain} seen again`,
              );
            }

            if (result.ranked) {
              console.log(
                `  ${project.slug}   ranker: scored ${result.ranked.scored}, auto-dismissed ${result.ranked.dismissed}`,
              );
            }

            if (result.whatsNew) {
              console.log(
                `  ${project.slug}   what's new: ${result.whatsNew.slice(0, 200)}${result.whatsNew.length > 200 ? "…" : ""}`,
              );
            }

            for (const s of result.skippedSources) {
              console.log(`  ${project.slug}   skipped ${s.name}: ${s.reason}`);
            }

            const costStr = result.costEstimateUSD
              ? ` (total $${result.costEstimateUSD.toFixed(4)})`
              : "";
            console.log(
              `  ${project.slug}   scan #${result.scanId} ${result.status}, ${result.newCount} new findings${costStr}${result.error ? `: ${result.error}` : ""}`,
            );
          }

          db.close();
          console.log("");
          console.log("\u2713 Done");
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(msg);
          process.exit(exitCodeFor(err));
        }
      },
    );
}
