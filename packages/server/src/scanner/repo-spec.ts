import { isAbsolute } from "node:path";
import { ConfigError } from "@/lib/errors.js";
import { expandTilde } from "@/lib/paths.js";

export type RepoSpec =
  | {
      type: "github";
      owner: string;
      repo: string;
      branch: string | null;
      /** Canonical URL form, for logs + display. */
      url: string;
    }
  | {
      type: "local";
      path: string;
    };

const HTTPS_GITHUB = /^https?:\/\/github\.com\/([^\/\s]+)\/([^\/\s#?]+?)(?:\.git)?\/?$/i;
const SSH_GITHUB = /^git@github\.com:([^\/\s]+)\/([^\/\s]+?)(?:\.git)?$/i;

/**
 * Parses a repo entry from config.yaml into a structured spec.
 *
 * Accepts:
 *   - https://github.com/owner/repo   (trailing slash + .git tolerated)
 *   - git@github.com:owner/repo.git
 *   - absolute filesystem paths (/Users/...)
 *   - ~-prefixed filesystem paths (~/Projects/...)
 *
 * Rejects anything else so a user-typed typo surfaces at config-parse time,
 * not mid-scan.
 */
export function parseRepoSpec(
  pathOrUrl: string,
  branch?: string | null,
): RepoSpec {
  const input = pathOrUrl.trim();

  const httpsMatch = input.match(HTTPS_GITHUB);
  if (httpsMatch) {
    const [, owner, repo] = httpsMatch;
    return {
      type: "github",
      owner: owner!,
      repo: repo!,
      branch: branch ?? null,
      url: `https://github.com/${owner}/${repo}`,
    };
  }

  const sshMatch = input.match(SSH_GITHUB);
  if (sshMatch) {
    const [, owner, repo] = sshMatch;
    return {
      type: "github",
      owner: owner!,
      repo: repo!,
      branch: branch ?? null,
      url: `https://github.com/${owner}/${repo}`,
    };
  }

  const expanded = expandTilde(input);
  if (isAbsolute(expanded)) {
    return { type: "local", path: expanded };
  }

  throw new ConfigError(
    `repo path is not a recognized form: '${input}'. Expected a https://github.com/... URL or an absolute filesystem path.`,
  );
}

/**
 * Convenience: human-friendly label for logs + CLI output.
 */
export function describeSpec(spec: RepoSpec): string {
  return spec.type === "github"
    ? spec.branch
      ? `${spec.url} (${spec.branch})`
      : spec.url
    : spec.path;
}
