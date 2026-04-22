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
}

const ENDPOINT = "https://lobste.rs/search.json";
const USER_AGENT = "sidescan/0.1";

export class LobstersSource implements Source {
  readonly name = "lobsters" as const;
  readonly tab = "news" as const;
  readonly ready = true;

  async search(opts: SearchOptions): Promise<Finding[]> {
    const perQueryLimit = opts.perQueryLimit ?? 10;
    const maxFindings = opts.maxFindings ?? 50;
    const all: Finding[] = [];

    for (const query of opts.queries) {
      try {
        const results = await this.searchOne(
          query,
          perQueryLimit,
          opts.since,
        );
        all.push(...results);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn(
          { source: "lobsters", query, err: msg },
          "Lobsters search failed",
        );
      }
    }

    return dedupeAndCap(all, maxFindings);
  }

  private async searchOne(
    query: string,
    limit: number,
    since: string | null | undefined,
  ): Promise<Finding[]> {
    const params = new URLSearchParams({
      q: query,
      what: "stories",
      order: "newest",
    });
    const res = await fetch(`${ENDPOINT}?${params.toString()}`, {
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
    });
    if (!res.ok) {
      throw new Error(`Lobsters ${res.status}: ${await res.text()}`);
    }
    const body: unknown = await res.json();
    const stories = extractStories(body);
    const sinceMs = since ? Date.parse(since) : 0;

    return stories
      .filter((s) => Date.parse(s.created_at) >= sinceMs)
      .slice(0, limit)
      .map(toFinding);
  }
}

function extractStories(body: unknown): LobstersStory[] {
  if (Array.isArray(body)) return body as LobstersStory[];
  if (body && typeof body === "object") {
    const maybe = (body as { stories?: unknown }).stories;
    if (Array.isArray(maybe)) return maybe as LobstersStory[];
  }
  return [];
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
