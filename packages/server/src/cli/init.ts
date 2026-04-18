import type { Command } from "commander";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { dataDir, configPath } from "@/lib/paths.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * When bundled, example.yaml is copied alongside dist/cli/index.js by the
 * "files" entry in package.json. In dev (tsx), we resolve to the src copy.
 */
function exampleYamlPath(): string {
  // dist layout: dist/cli/index.js -> ../config/example.yaml? No — we place
  // example.yaml under src/config/ and ship it via "files" in package.json.
  // tsup does not bundle .yaml, so we resolve relative to source.
  const distCandidate = join(__dirname, "..", "config", "example.yaml");
  if (existsSync(distCandidate)) return distCandidate;
  // Fall back to package root / src / config (when running via tsx).
  const srcCandidate = join(__dirname, "..", "..", "src", "config", "example.yaml");
  return srcCandidate;
}

export function registerInit(program: Command): void {
  program
    .command("init")
    .description("Create config directory and starter config.yaml")
    .option("--force", "overwrite existing config")
    .option("--yes, -y", "skip confirmation prompts")
    .action((opts: { force?: boolean; yes?: boolean }) => {
      const dir = dataDir();
      const target = configPath();

      if (existsSync(target) && !opts.force) {
        console.error(
          `Config already exists at ${target}. Use --force to overwrite.`,
        );
        process.exit(1);
      }

      mkdirSync(dir, { recursive: true });
      copyFileSync(exampleYamlPath(), target);

      console.log(`\u2713 Created ${target}`);
      console.log(
        "  Edit it to add your projects, then run `sidescan start`.",
      );
    });
}
