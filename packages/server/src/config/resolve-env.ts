import { existsSync } from "node:fs";
import { config as loadDotenv } from "dotenv";
import { envFilePath } from "@/lib/paths.js";
import { ConfigError } from "@/lib/errors.js";
import type { Config, ProvidersConfig } from "@/config/schema.js";

export interface ResolvedKeys {
  aiKey: string | null;
  aiHost: string | null;
  searchKey: string | null;
  githubToken: string | null;
}

/**
 * Loads .env from the current working directory if present.
 * Shell env still wins (dotenv does not override by default).
 */
export function loadEnvFile(): void {
  const p = envFilePath();
  if (existsSync(p)) {
    loadDotenv({ path: p });
  }
}

const AI_KEY_ENV: Record<ProvidersConfig["ai"], string | null> = {
  claude: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  ollama: null,
};

const SEARCH_KEY_ENV: Record<NonNullable<ProvidersConfig["search"]>, string> = {
  brave: "BRAVE_API_KEY",
  serper: "SERPER_API_KEY",
};

export function resolveKeys(config: Config): ResolvedKeys {
  const aiEnvName = AI_KEY_ENV[config.providers.ai];
  const aiKey = aiEnvName ? (process.env[aiEnvName] ?? null) : null;
  const aiHost =
    config.providers.ai === "ollama"
      ? (process.env["OLLAMA_HOST"] ?? "http://localhost:11434")
      : null;

  const searchKey = config.providers.search
    ? (process.env[SEARCH_KEY_ENV[config.providers.search]] ?? null)
    : null;

  const githubTokenEnv = config.sources.github.token_env;
  const githubToken = process.env[githubTokenEnv] ?? null;

  return { aiKey, aiHost, searchKey, githubToken };
}

/**
 * Throws ConfigError if required keys are missing. Non-fatal gaps
 * (search provider key, GitHub token) are reported as warnings.
 */
export function assertRequiredKeys(config: Config, keys: ResolvedKeys): string[] {
  const warnings: string[] = [];

  if (config.providers.ai !== "ollama" && !keys.aiKey) {
    const envName = AI_KEY_ENV[config.providers.ai];
    throw new ConfigError(
      `Set ${envName} in your environment or in .env`,
    );
  }

  if (config.providers.search && !keys.searchKey) {
    const envName = SEARCH_KEY_ENV[config.providers.search];
    warnings.push(
      `${envName} not set — News tab will have web search disabled.`,
    );
  }

  if (!keys.githubToken) {
    warnings.push(
      `${config.sources.github.token_env} not set — GitHub API will use unauthenticated rate limits.`,
    );
  }

  return warnings;
}
