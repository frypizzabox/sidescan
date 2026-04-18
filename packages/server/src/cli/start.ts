import type { Command } from "commander";
import { writeFileSync, unlinkSync } from "node:fs";
import { serve } from "@hono/node-server";
import { configPath, dbPath, pidPath } from "@/lib/paths.js";
import { logger } from "@/lib/logger.js";
import { exitCodeFor } from "@/lib/errors.js";
import { loadConfig } from "@/config/parse.js";
import {
  loadEnvFile,
  resolveKeys,
  assertRequiredKeys,
} from "@/config/resolve-env.js";
import { reconcile, formatReconcileSummary } from "@/config/reconcile.js";
import { watchFile } from "@/config/watch.js";
import { openDb } from "@/db/connection.js";
import { migrate } from "@/db/migrate.js";
import { createServer } from "@/api/server.js";
import type { ReloadResult } from "@/api/routes.js";
import { createAIProvider } from "@/ai/factory.js";
import { startScheduler } from "@/scheduler/cron.js";

export function registerStart(program: Command, version: string): void {
  program
    .command("start")
    .description("Boot the server (runs migrations, reconciles config, starts API + scheduler)")
    .option("--port <n>", "override config port", (v) => parseInt(v, 10))
    .option("--host <h>", "override config host")
    .option("--watch-config", "auto-reload when config.yaml changes")
    .option("--no-scheduler", "skip the in-process cron scheduler")
    .option("--verbose", "debug logging")
    .action(
      async (opts: {
        port?: number;
        host?: string;
        watchConfig?: boolean;
        scheduler?: boolean;
        verbose?: boolean;
      }) => {
        if (opts.verbose) logger.level = "debug";

        try {
          loadEnvFile();
          const config = loadConfig(configPath());
          console.log(
            `\u2713 Loaded config (${config.projects.length} project${config.projects.length === 1 ? "" : "s"})`,
          );

          const keys = resolveKeys(config);
          const warnings = assertRequiredKeys(config, keys);
          for (const w of warnings) console.warn(`  ! ${w}`);

          const db = openDb(dbPath());
          const applied = migrate(db);
          if (applied.length > 0) {
            console.log(
              `\u2713 Database ready (${applied.length} migration${applied.length === 1 ? "" : "s"} applied)`,
            );
          } else {
            console.log("\u2713 Database ready (up to date)");
          }

          const initial = reconcile(db, config);
          console.log(
            `\u2713 Reconciled projects (${formatReconcileSummary(initial)})`,
          );

          // Optional cron scheduler. Default on; user can opt out with --no-scheduler.
          const schedulerEnabled = opts.scheduler !== false;
          const scheduler = schedulerEnabled
            ? startScheduler({
                db,
                config,
                provider: createAIProvider(config),
              })
            : null;
          if (scheduler) {
            console.log(
              `\u2713 Scheduler started (${scheduler.activeCount()} auto-scan projects)`,
            );
          }

          // Reload handler: re-reads config and reconciles. Reinstalls
          // scheduler jobs so frequency / time changes take effect.
          const onReload = (): ReloadResult => {
            try {
              const fresh = loadConfig(configPath());
              const summary = reconcile(db, fresh);
              if (scheduler) scheduler.reload(fresh);
              const msg = formatReconcileSummary(summary);
              console.log(`\u21bb Config reloaded (${msg})`);
              return { ok: true, summary: msg };
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              console.error(`  ! Reload failed: ${msg}`);
              return { ok: false, error: msg };
            }
          };

          const port = opts.port ?? config.server.port;
          const host = opts.host ?? config.server.host;
          const app = createServer({ db, version, onReload });

          const pid = pidPath();
          const cleanup = (exitCode = 0) => {
            scheduler?.stop();
            try {
              unlinkSync(pid);
            } catch {
              // ignore
            }
            process.exit(exitCode);
          };
          process.on("SIGINT", () => cleanup(0));
          process.on("SIGTERM", () => cleanup(0));

          const stopWatcher = opts.watchConfig
            ? watchFile(configPath(), onReload)
            : () => {};

          serve({ fetch: app.fetch, port, hostname: host }, (info) => {
            writeFileSync(pid, String(process.pid));
            console.log(`\u2192 Serving http://${host}:${info.port}`);
            if (opts.watchConfig) {
              console.log("  Watching config.yaml for changes.");
            }
            console.log("  Press Ctrl+C to stop.");
          });

          void stopWatcher;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(msg);
          process.exit(exitCodeFor(err));
        }
      },
    );
}
