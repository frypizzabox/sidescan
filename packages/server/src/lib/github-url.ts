/**
 * Normalizes a GitHub URL (or `git@github.com:owner/repo.git` SSH form) to
 * `owner/repo` in lowercase. Returns null for non-GitHub URLs or local paths.
 *
 * Used to match a project's own repos against github_similar findings so we
 * never list the user's own code as a competitor.
 */
export function githubRepoKey(input: string): string | null {
  const s = input.trim();
  if (!s) return null;

  // SSH: git@github.com:owner/repo(.git)?
  const ssh = s.match(/^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?\/?$/i);
  if (ssh && ssh[1] && ssh[2]) {
    return `${ssh[1].toLowerCase()}/${ssh[2].toLowerCase()}`;
  }

  // https://github.com/owner/repo(.git)? (any trailing path/query/hash stripped)
  try {
    const u = new URL(s);
    if (u.host.toLowerCase() !== "github.com") return null;
    const parts = u.pathname.split("/").filter(Boolean);
    const owner = parts[0];
    const repoRaw = parts[1];
    if (!owner || !repoRaw) return null;
    const repo = repoRaw.replace(/\.git$/i, "").toLowerCase();
    return `${owner.toLowerCase()}/${repo}`;
  } catch {
    return null;
  }
}
