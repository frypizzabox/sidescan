import { logger } from "@/lib/logger.js";
import type { Finding, SearchOptions, Source } from "@/sources/source.js";
import { dedupeAndCap } from "@/sources/source.js";

interface HNHit {
  objectID: string;
  story_id?: number;
  parent_id?: number;
  title?: string | null;
  story_title?: string | null;
  url?: string | null;
  story_url?: string | null;
  comment_text?: string | null;
  author?: string;
  created_at?: string;
  points?: number;
}

interface HNResponse {
  hits: HNHit[];
  nbHits: number;
}

const ENDPOINT = "https://hn.algolia.com/api/v1/search";

export class HNSource implements Source {
  readonly name = "hn" as const;
  readonly tab = "news" as const;
  readonly ready = true; // no auth required

  async search(opts: SearchOptions): Promise<Finding[]> {
    const perQueryLimit = opts.perQueryLimit ?? 10;
    const maxFindings = opts.maxFindings ?? 50;
    const all: Finding[] = [];

    for (const query of opts.queries) {
      try {
        const results = await this.searchOne(query, perQueryLimit, opts.since);
        all.push(...results);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn({ source: "hn", query, err: msg }, "HN search failed");
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
      query,
      hitsPerPage: String(limit),
      tags: "(story,comment)",
    });
    if (since) {
      const ts = Math.floor(new Date(since).getTime() / 1000);
      if (Number.isFinite(ts)) {
        params.set("numericFilters", `created_at_i>${ts}`);
      }
    }
    const res = await fetch(`${ENDPOINT}?${params.toString()}`);
    if (!res.ok) {
      throw new Error(`HN ${res.status}: ${await res.text()}`);
    }
    const body = (await res.json()) as HNResponse;

    return body.hits
      .map((hit) => toFinding(hit))
      .filter((f): f is Finding => f !== null);
  }
}

function toFinding(hit: HNHit): Finding | null {
  const title = hit.title ?? hit.story_title ?? null;
  if (!title) return null;

  // Prefer external URL for stories; HN thread URL for comments.
  let url = hit.url ?? hit.story_url ?? null;
  if (!url) {
    const id = hit.story_id ?? hit.objectID;
    if (!id) return null;
    url = `https://news.ycombinator.com/item?id=${id}`;
  }

  const snippet = hit.comment_text
    ? stripHtml(hit.comment_text).slice(0, 240)
    : hit.points != null
      ? `${hit.points} points on Hacker News`
      : null;

  return {
    source: "hn",
    tab: "news",
    url,
    title,
    snippet,
    eventDate: hit.created_at ?? null,
  };
}

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
