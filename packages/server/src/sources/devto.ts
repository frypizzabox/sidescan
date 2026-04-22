import { logger } from "@/lib/logger.js";
import type { Finding, SearchOptions, Source } from "@/sources/source.js";
import { dedupeAndCap } from "@/sources/source.js";

interface DevToArticle {
  id: number;
  title: string;
  description: string;
  url: string;
  published_at: string;
  positive_reactions_count?: number;
  comments_count?: number;
  cover_image: string | null;
  tag_list?: string[];
}

const ENDPOINT = "https://dev.to/api/articles";

export class DevToSource implements Source {
  readonly name = "devto" as const;
  readonly tab = "news" as const;
  readonly ready = true;

  async search(opts: SearchOptions): Promise<Finding[]> {
    const perQueryLimit = opts.perQueryLimit ?? 10;
    const maxFindings = opts.maxFindings ?? 50;
    const all: Finding[] = [];
    const seenTags = new Set<string>();

    for (const query of opts.queries) {
      const tag = normaliseTag(query);
      if (!tag || seenTags.has(tag)) continue;
      seenTags.add(tag);
      try {
        const results = await this.searchOne(tag, perQueryLimit, opts.since);
        all.push(...results);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn(
          { source: "devto", tag, err: msg },
          "Dev.to fetch failed",
        );
      }
    }

    return dedupeAndCap(all, maxFindings);
  }

  private async searchOne(
    tag: string,
    limit: number,
    since: string | null | undefined,
  ): Promise<Finding[]> {
    const params = new URLSearchParams({
      tag,
      per_page: String(limit),
    });
    const res = await fetch(`${ENDPOINT}?${params.toString()}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`Dev.to ${res.status}: ${await res.text()}`);
    }
    const body = (await res.json()) as DevToArticle[];
    if (!Array.isArray(body)) return [];
    const sinceMs = since ? Date.parse(since) : 0;

    return body
      .filter((a) => Date.parse(a.published_at) >= sinceMs)
      .map(toFinding);
  }
}

/**
 * Dev.to's public article endpoint filters by tag, not free text, so we
 * approximate by picking the first meaningful token of the query. Multi-word
 * queries like "retention analytics" become the tag "retention".
 */
export function normaliseTag(query: string): string | null {
  for (const raw of query.toLowerCase().split(/\s+/)) {
    const clean = raw.replace(/[^a-z0-9]/g, "");
    if (clean.length >= 3) return clean;
  }
  return null;
}

function toFinding(a: DevToArticle): Finding {
  return {
    source: "devto",
    tab: "news",
    url: a.url,
    title: a.title,
    snippet: a.description
      ? a.description.replace(/\s+/g, " ").trim().slice(0, 240)
      : null,
    eventDate: a.published_at,
    points: typeof a.positive_reactions_count === "number"
      ? a.positive_reactions_count
      : null,
    comments: typeof a.comments_count === "number" ? a.comments_count : null,
    thumbnailUrl: a.cover_image,
    faviconUrl: "https://dev.to/favicon.ico",
  };
}
