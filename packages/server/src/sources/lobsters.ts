import { logger } from "@/lib/logger.js";
import type { Finding, SearchOptions, Source } from "@/sources/source.js";
import { dedupeAndCap } from "@/sources/source.js";

interface LobstersStory {
  short_id: string;
  short_id_url: string;
  title: string;
  url: string;
  created_at: string;
  score?: number;
  upvotes?: number;
  downvotes?: number;
  comments_count?: number;
  comments_url?: string;
  description?: string;
  tags?: string[];
}

const ENDPOINT = "https://lobste.rs/newest.json";
const USER_AGENT = "sidescan/0.1";

/**
 * Lobste.rs has no public JSON search endpoint — `/search` is HTML-only
 * and rejects JSON-format params. We fall back to polling the newest-stories
 * feed and filtering client-side by whether the query's significant tokens
 * appear in the title/description/tags.
 */
export class LobstersSource implements Source {
  readonly name = "lobsters" as const;
  readonly tab = "news" as const;
  readonly ready = true;

  async search(opts: SearchOptions): Promise<Finding[]> {
    const perQueryLimit = opts.perQueryLimit ?? 10;
    const maxFindings = opts.maxFindings ?? 50;

    let stories: LobstersStory[];
    try {
      stories = await fetchNewest();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn({ source: "lobsters", err: msg }, "Lobsters fetch failed");
      return [];
    }

    const sinceMs = opts.since ? Date.parse(opts.since) : 0;
    const fresh = stories.filter(
      (s) => Date.parse(s.created_at) >= sinceMs,
    );

    const all: Finding[] = [];
    for (const query of opts.queries) {
      const matches = fresh
        .filter((s) => storyMatchesQuery(s, query))
        .slice(0, perQueryLimit)
        .map(toFinding);
      all.push(...matches);
    }

    return dedupeAndCap(all, maxFindings);
  }
}

async function fetchNewest(): Promise<LobstersStory[]> {
  const res = await fetch(ENDPOINT, {
    headers: {
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    },
  });
  if (!res.ok) {
    throw new Error(`Lobsters ${res.status}: ${await res.text()}`);
  }
  const body: unknown = await res.json();
  return Array.isArray(body) ? (body as LobstersStory[]) : [];
}

/**
 * Simple relevance test: every token in the query (length >= 3, lowercase)
 * must appear somewhere in the story's title, description, or tags. Misses
 * phrase-level intent, but catches "react hooks" against a "React Hooks
 * deep-dive" story.
 */
export function storyMatchesQuery(
  story: LobstersStory,
  query: string,
): boolean {
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[^a-z0-9]/g, ""))
    .filter((t) => t.length >= 3);
  if (tokens.length === 0) return false;
  const haystack = [
    story.title ?? "",
    story.description ?? "",
    ...(story.tags ?? []),
  ]
    .join(" ")
    .toLowerCase();
  return tokens.every((t) => haystack.includes(t));
}

function toFinding(s: LobstersStory): Finding {
  const url = s.url || s.short_id_url || s.comments_url || "";
  const points =
    typeof s.score === "number"
      ? s.score
      : typeof s.upvotes === "number" && typeof s.downvotes === "number"
        ? s.upvotes - s.downvotes
        : null;
  return {
    source: "lobsters",
    tab: "news",
    url,
    title: s.title,
    snippet: s.description
      ? s.description.replace(/\s+/g, " ").trim().slice(0, 240)
      : null,
    eventDate: s.created_at,
    points,
    comments: typeof s.comments_count === "number" ? s.comments_count : null,
    faviconUrl: "https://lobste.rs/favicon.ico",
  };
}
