import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { ConfigError } from "@/lib/errors.js";
import { expandTilde } from "@/lib/paths.js";
import { ConfigSchema, type Config } from "@/config/schema.js";

export function parseConfig(yamlText: string): Config {
  let raw: unknown;
  try {
    raw = parseYaml(yamlText);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new ConfigError(`Invalid YAML: ${msg}`);
  }

  if (raw === null || typeof raw !== "object") {
    throw new ConfigError("Config must be a YAML mapping");
  }

  const result = ConfigSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new ConfigError(`Config validation failed:\n${issues}`);
  }

  return normalizePaths(result.data);
}

export function loadConfig(path: string): Config {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === "ENOENT") {
      throw new ConfigError(
        `No config at ${path}. Run 'sidescan init' first.`,
      );
    }
    throw new ConfigError(`Failed to read config at ${path}: ${e.message}`);
  }
  return parseConfig(text);
}

function normalizePaths(config: Config): Config {
  return {
    ...config,
    projects: config.projects.map((p) => ({
      ...p,
      repos: p.repos.map((r) => ({ ...r, path: expandTilde(r.path) })),
    })),
  };
}
