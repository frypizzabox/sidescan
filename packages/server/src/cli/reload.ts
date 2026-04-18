import type { Command } from "commander";
import { loadConfig } from "@/config/parse.js";
import { configPath } from "@/lib/paths.js";
import { exitCodeFor } from "@/lib/errors.js";

interface ReloadResponse {
  ok: boolean;
  summary?: string;
  error?: string;
}

export function registerReload(program: Command): void {
  program
    .command("reload")
    .description("Re-read config.yaml on a running server")
    .option("--port <n>", "server port", (v) => parseInt(v, 10))
    .option("--host <h>", "server host")
    .action(async (opts: { port?: number; host?: string }) => {
      try {
        const config = loadConfig(configPath());
        const port = opts.port ?? config.server.port;
        const host = opts.host ?? config.server.host;
        const url = `http://${host}:${port}/api/reload`;

        const res = await fetch(url, { method: "POST" });
        const body = (await res.json()) as ReloadResponse;

        if (!res.ok || !body.ok) {
          console.error(`\u2717 Reload failed: ${body.error ?? res.statusText}`);
          process.exit(1);
        }
        console.log(`\u2713 Config reloaded (${body.summary ?? "no changes"})`);
      } catch (err) {
        if (err instanceof TypeError && err.message.includes("fetch")) {
          console.error(
            "Sidescan is not running or cannot be reached. Run 'sidescan start' first.",
          );
          process.exit(1);
        }
        const msg = err instanceof Error ? err.message : String(err);
        console.error(msg);
        process.exit(exitCodeFor(err));
      }
    });
}
