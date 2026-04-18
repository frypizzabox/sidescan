import type { Command } from "commander";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { configPath, dataDir, envFilePath } from "@/lib/paths.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Locate the shipped example.yaml. In dev (tsx) it lives at
 * packages/server/src/config/example.yaml; in the published tarball it
 * also ships there via the "files" entry in package.json.
 */
function exampleYamlPath(): string {
  const candidates = [
    join(__dirname, "..", "config", "example.yaml"),
    join(__dirname, "..", "..", "src", "config", "example.yaml"),
    join(__dirname, "..", "..", "..", "src", "config", "example.yaml"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  throw new Error("Could not locate example.yaml shipped with the package");
}

const ENV_TEMPLATE = `# Sidescan secrets. This file is gitignored.
# Set the keys for the providers you've enabled in config.yaml.

# ANTHROPIC_API_KEY=sk-ant-...
# OPENAI_API_KEY=sk-...
# BRAVE_API_KEY=...
# SERPER_API_KEY=...
# GITHUB_TOKEN=ghp_...   # optional, raises GitHub API rate limits
`;

export function registerInit(program: Command): void {
  program
    .command("init")
    .description("Create config.yaml, .env, and data/ in the current directory")
    .option("--force", "overwrite existing config.yaml")
    .action((opts: { force?: boolean }) => {
      const target = configPath();
      const envTarget = envFilePath();
      const dir = dataDir();

      if (existsSync(target) && !opts.force) {
        console.error(
          `config.yaml already exists at ${target}. Use --force to overwrite.`,
        );
        process.exit(1);
      }

      copyFileSync(exampleYamlPath(), target);
      mkdirSync(dir, { recursive: true });

      // Write .env template only if the user doesn't already have one.
      let wroteEnv = false;
      if (!existsSync(envTarget)) {
        writeFileSync(envTarget, ENV_TEMPLATE);
        wroteEnv = true;
      }

      console.log(`\u2713 Created ${target}`);
      console.log(`\u2713 Created ${dir}/`);
      if (wroteEnv) {
        console.log(`\u2713 Created ${envTarget} (add your API keys)`);
      } else {
        console.log(`  (${envTarget} already exists, left alone)`);
      }
      console.log("");
      console.log(
        "  Next: edit config.yaml + set keys in .env, then `sidescan start`.",
      );
    });
}
