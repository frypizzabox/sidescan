import { logger } from "@/lib/logger.js";
import type { Finding, SearchOptions, Source } from "@/sources/source.js";
import { dedupeAndCap } from "@/sources/source.js";

interface GitHubRepo {
  id: number;
  full_name: string;
  name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  language: string | null;
  pushed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  score: number;
}

interface GitHubSearchResponse {
  total_count: number;
  items: GitHubRepo[];
}

const ENDPOINT = "https://api.github.com/search/repositories";

export class GitHubSimilarSource implements Source {
  readonly name = "github_similar" as const;
  readonly tab = "github" as const;
  readonly ready = true;

  constructor(private readonly token: string | null) {}

  async search(opts: SearchOptions): Promise<Finding[]> {
    const perQueryLimit = Math.min(opts.perQueryLimit ?? 10, 30);
    const maxFindings = opts.maxFindings ?? 50;
    const all: Finding[] = [];

    for (const query of opts.queries) {
      try {
        const results = await this.searchOne(query, perQueryLimit);
        all.push(...results);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn(
          { source: "github_similar", query, err: msg },
          "GitHub search failed",
        );
        // On rate-limit hit, stop hammering
        if (msg.includes("rate limit") || msg.includes("403")) break;
      }
    }

    return dedupeAndCap(all, maxFindings);
  }

  private async searchOne(
    query: string,
    limit: number,
  ): Promise<Finding[]> {
    const params = new URLSearchParams({
      q: query,
      sort: "stars",
      order: "desc",
      per_page: String(limit),
    });
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "sidescan/0.1",
    };
    if (this.token) headers["Authorization"] = `Bearer ${this.token}`;

    const res = await fetch(`${ENDPOINT}?${params.toString()}`, { headers });
    if (!res.ok) {
      throw new Error(`GitHub ${res.status}: ${await res.text()}`);
    }
    const body = (await res.json()) as GitHubSearchResponse;

    return body.items.map((repo) => {
      // GitHub returns a "score" that's relative to the query — useful as
      // a first-pass similarity signal. Normalize roughly to 0..1.
      const similarity = Math.min(repo.score / 20, 1);
      return {
        source: "github_similar",
        tab: "github",
        url: repo.html_url,
        title: repo.full_name,
        snippet: buildSnippet(repo),
        eventDate: repo.pushed_at ?? repo.updated_at ?? null,
        similarityScore: similarity,
      } satisfies Finding;
    });
  }
}

function buildSnippet(repo: GitHubRepo): string {
  const parts: string[] = [];
  if (repo.description) parts.push(repo.description);
  const meta: string[] = [];
  if (repo.stargazers_count != null) {
    meta.push(`★ ${repo.stargazers_count.toLocaleString()}`);
  }
  if (repo.language) meta.push(repo.language);
  if (meta.length > 0) parts.push(`(${meta.join(" · ")})`);
  return parts.join(" ");
}
