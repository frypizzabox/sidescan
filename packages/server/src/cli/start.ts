import type { Command } from "commander";
import { serve } from "@hono/node-server";
import { configPath, dbPath } from "@/lib/paths.js";
import { logger } from "@/lib/logger.js";
import { exitCodeFor } from "@/lib/errors.js";
import { loadConfig } from "@/config/parse.js";
import { loadEnvFile, resolveKeys, assertRequiredKeys } from "@/config/resolve-env.js";
import { openDb } from "@/db/connection.js";
import { migrate } from "@/db/migrate.js";
import { createServer } from "@/api/server.js";

export function registerStart(program: Command, version: string): void {
  program
    .command("start")
    .description("Boot the server (runs migrations, starts scheduler)")
    .option("--port <n>", "override config port", (v) => parseInt(v, 10))
    .option("--host <h>", "override config host")
    .option("--verbose", "debug logging")
    .action(async (opts: { port?: number; host?: string; verbose?: boolean }) => {
      if (opts.verbose) {
        logger.level = "debug";
      }

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
        console.log(
          `\u2713 Database ready${applied.length > 0 ? ` (${applied.length} migration${applied.length === 1 ? "" : "s"} applied)` : ""}`,
        );
        db.close();

        const port = opts.port ?? config.server.port;
        const host = opts.host ?? config.server.host;
        const app = createServer({ version });

        serve({ fetch: app.fetch, port, hostname: host }, (info) => {
          console.log(`\u2192 Serving http://${host}:${info.port}`);
          console.log("  Press Ctrl+C to stop.");
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(msg);
        process.exit(exitCodeFor(err));
      }
    });
}
