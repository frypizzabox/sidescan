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
import { listProjects } from "@/db/queries.js";

export function registerScan(program: Command): void {
  program
    .command("scan [project-slug]")
    .description("Scan a project (or all non-manual projects) for new findings")
    .option("--bootstrap", "treat as a bootstrap scan (uses lookback_years)")
    .option("--verbose", "debug logging")
    .action(
      async (
        slug: string | undefined,
        opts: { bootstrap?: boolean; verbose?: boolean },
      ) => {
        try {
          loadEnvFile();
          const config = loadConfig(configPath());
          const db = openDb(dbPath());
          migrate(db);
          reconcile(db, config);

          const provider = createAIProvider(config);

          // Determine target slugs
          const all = listProjects(db);
          const targets = slug
            ? all.filter((p) => p.slug === slug)
            : all.filter((p) => p.scan_frequency !== "manual");

          if (targets.length === 0) {
            if (slug) {
              console.error(
                `Unknown project: '${slug}'. Known: ${all.map((p) => p.slug).join(", ") || "(none)"}`,
              );
              process.exit(2);
            }
            console.log("No projects to scan (all are frequency=manual).");
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
              provider,
              projectSlug: project.slug,
              bootstrap: opts.bootstrap,
            });

            for (const a of result.activity) {
              console.log(
                `  ${project.slug}   repo activity: ${a.commitsInserted} commits (${a.repoPath})`,
              );
            }
            if (result.inference) {
              const cost = result.costEstimateUSD
                ? ` ($${result.costEstimateUSD.toFixed(4)})`
                : "";
              console.log(
                `  ${project.slug}   inference: ${result.inference.search_queries.length} queries, ${result.inference.inputTokens} in / ${result.inference.outputTokens} out${cost}`,
              );
              console.log(
                `  ${project.slug}   summary: ${result.inference.summary.slice(0, 120)}${result.inference.summary.length > 120 ? "…" : ""}`,
              );
            }
            console.log(
              `  ${project.slug}   scan #${result.scanId} ${result.status}${result.error ? `: ${result.error}` : ""}`,
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
