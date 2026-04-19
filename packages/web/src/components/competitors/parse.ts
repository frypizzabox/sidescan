import type { Finding } from "@/lib/api";

export interface CompetitorView {
  id: number;
  url: string;
  owner: string;
  name: string;
  fullName: string;
  description: string | null;
  stars: number | null;
  language: string | null;
  lastPushedAt: string | null;
  relevanceScore: number | null;
  similarityScore: number | null;
  isNew: boolean;
  readAt: string | null;
  avatarSeed: string;
  thumbnailUrl: string | null;
}

/**
 * Normalizes a github_similar Finding into a CompetitorView.
 *
 * New scans have structured columns populated directly by the server. Rows
 * predating migration 004 only have title + snippet; this fallback parses
 * "owner/repo" out of title and stars/language out of "(★ 1,234 · TS)".
 * Drop the fallback once the DB is fully re-scanned.
 */
export function parseCompetitor(f: Finding): CompetitorView {
  let owner = f.owner ?? "";
  let name = f.repoName ?? "";
  if (!owner || !name) {
    const [o = f.title, n = ""] = f.title.split("/");
    owner = owner || o;
    name = name || n;
  }
  const fullName = owner && name ? `${owner}/${name}` : f.title;

  let description = f.description ?? null;
  let stars = f.stars ?? null;
  let language = f.language ?? null;

  if ((description == null || stars == null || language == null) && f.snippet) {
    const metaMatch = f.snippet.match(/\s*\((.+)\)\s*$/);
    if (metaMatch) {
      if (description == null) {
        description = f.snippet.slice(0, metaMatch.index).trim() || null;
      }
      for (const part of metaMatch[1].split("·").map((s) => s.trim())) {
        if (part.startsWith("★") && stars == null) {
          const parsed = Number(part.replace(/[★,\s]/g, ""));
          if (Number.isFinite(parsed)) stars = parsed;
        } else if (language == null && part.length > 0) {
          language = part;
        }
      }
    } else if (description == null) {
      description = f.snippet;
    }
  }

  return {
    id: f.id,
    url: f.url,
    owner,
    name,
    fullName,
    description,
    stars,
    language,
    lastPushedAt: f.lastPushedAt ?? f.eventDate,
    relevanceScore: f.relevanceScore,
    similarityScore: f.similarityScore,
    isNew: f.isNew,
    readAt: f.readAt,
    avatarSeed: fullName,
    thumbnailUrl: f.thumbnailUrl,
  };
}

export const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: "#3178c6",
  JavaScript: "#f7df1e",
  Python: "#3572A5",
  Go: "#00ADD8",
  Rust: "#dea584",
  Ruby: "#701516",
  Java: "#b07219",
  Kotlin: "#A97BFF",
  Swift: "#F05138",
  C: "#555555",
  "C++": "#f34b7d",
  "C#": "#178600",
  PHP: "#4F5D95",
  HTML: "#e34c26",
  CSS: "#563d7c",
  Shell: "#89e051",
  Svelte: "#ff3e00",
  Vue: "#41b883",
  Elixir: "#6e4a7e",
  Haskell: "#5e5086",
  Lua: "#000080",
  GDScript: "#355570",
};
