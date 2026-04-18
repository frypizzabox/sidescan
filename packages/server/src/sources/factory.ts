import type { Config } from "@/config/schema.js";
import { resolveKeys } from "@/config/resolve-env.js";
import type { Source } from "@/sources/source.js";
import { HNSource } from "@/sources/hn.js";
import { GitHubSimilarSource } from "@/sources/github-similar.js";
import { BraveWebSource } from "@/sources/web-brave.js";
import { SerperWebSource } from "@/sources/web-serper.js";

export interface SourceSet {
  active: Source[];
  /** Sources that could run but were skipped because a key is missing. */
  skipped: { name: string; reason: string }[];
}

/**
 * Builds the set of active sources for a scan. HN and GitHub always run.
 * Web search runs only if the config selects a provider AND the matching
 * env key is set.
 */
export function buildSources(config: Config): SourceSet {
  const keys = resolveKeys(config);
  const active: Source[] = [];
  const skipped: { name: string; reason: string }[] = [];

  // HN — always on, no auth
  active.push(new HNSource());

  // GitHub — works unauthenticated (low rate limit) or with token (higher)
  active.push(new GitHubSimilarSource(keys.githubToken));

  // Web search — only if configured + key present
  if (config.providers.search === "brave") {
    if (keys.searchKey) {
      active.push(new BraveWebSource(keys.searchKey));
    } else {
      skipped.push({
        name: "web (brave)",
        reason:
          "BRAVE_API_KEY not set. Add it to .env to enable web search results.",
      });
    }
  } else if (config.providers.search === "serper") {
    if (keys.searchKey) {
      active.push(new SerperWebSource(keys.searchKey));
    } else {
      skipped.push({
        name: "web (serper)",
        reason:
          "SERPER_API_KEY not set. Add it to .env to enable web search results.",
      });
    }
  } else {
    skipped.push({
      name: "web",
      reason:
        "No web search provider configured. Set providers.search = brave or serper in config.yaml.",
    });
  }

  return { active, skipped };
}
