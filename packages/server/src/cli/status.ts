import type { Command } from "commander";
import { existsSync, readFileSync } from "node:fs";
import { configPath, dbPath, pidPath } from "@/lib/paths.js";
import { exitCodeFor } from "@/lib/errors.js";
import { loadConfig } from "@/config/parse.js";
import { openDb } from "@/db/connection.js";
import { listProjects, listReposForProject } from "@/db/queries.js";

export function registerStatus(program: Command, version: string): void {
  program
    .command("status")
    .description("Show server and project status")
    .action(() => {
      try {
        console.log(`Sidescan ${version}`);

        const pidExists = existsSync(pidPath());
        if (pidExists) {
          const pid = readFileSync(pidPath(), "utf8").trim();
          console.log(`Server     running (pid ${pid})`);
        } else {
          console.log("Server     not running");
        }

        if (!existsSync(configPath())) {
          console.log(
            "Config     not initialized — run 'sidescan init' first",
          );
          return;
        }

        const config = loadConfig(configPath());
        console.log(`Config     ${configPath()}`);

        if (!existsSync(dbPath())) {
          console.log(
            `Projects   ${config.projects.length} in config (db not initialized yet)`,
          );
          return;
        }

        const db = openDb(dbPath());
        const projects = listProjects(db);
        console.log("");
        console.log(
          `Projects   ${projects.length} total${
            projects.length === 0 ? " — dashboard will be empty" : ""
          }`,
        );

        for (const p of projects) {
          const repos = listReposForProject(db, p.id);
          const freq = p.scan_time
            ? `${p.scan_frequency} @ ${p.scan_time}`
            : p.scan_frequency;
          console.log(
            `  ${p.slug.padEnd(12)} ${freq.padEnd(18)} ${repos.length} repo${repos.length === 1 ? "" : "s"}`,
          );
        }

        db.close();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(msg);
        process.exit(exitCodeFor(err));
      }
    });
}
