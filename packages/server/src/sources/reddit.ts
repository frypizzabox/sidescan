import { logger } from "@/lib/logger.js";
import type { Finding, SearchOptions, Source } from "@/sources/source.js";
import { dedupeAndCap } from "@/sources/source.js";

interface RedditListing {
  data?: { children?: { data: RedditPost }[] };
}

interface RedditPost {
  title: string;
  url: string;
  permalink: string;
  score: number;
  num_comments: number;
  created_utc: number;
  subreddit: string;
  selftext?: string;
  over_18?: boolean;
}

const ENDPOINT = "https://www.reddit.com/search.json";
const USER_AGENT = "sidescan/0.1 (+https://github.com/frypizzabox/sidescan)";

export class RedditSource implements Source {
  readonly name = "reddit" as const;
  readonly tab = "news" as const;
  readonly ready = true;

  async search(opts: SearchOptions): Promise<Finding[]> {
    const perQueryLimit = opts.perQueryLimit ?? 15;
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
          { source: "reddit", query, err: msg },
          "Reddit search failed",
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
      sort: "new",
      limit: String(limit),
      type: "link",
      restrict_sr: "false",
    });
    const res = await fetch(`${ENDPOINT}?${params.toString()}`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`Reddit ${res.status}: ${await res.text()}`);
    }
    const body = (await res.json()) as RedditListing;
    const children = body.data?.children ?? [];
    const sinceMs = since ? Date.parse(since) : 0;

    return children
      .map((c) => c.data)
      .filter((p) => !p.over_18)
      .filter((p) => p.created_utc * 1000 >= sinceMs)
      .map(toFinding);
  }
}

function toFinding(post: RedditPost): Finding {
  // Reddit's `url` is the external target; self-posts use a reddit.com URL.
  const externalUrl =
    post.url && !post.url.startsWith("https://www.reddit.com")
      ? post.url
      : `https://www.reddit.com${post.permalink}`;
  const snippet = post.selftext
    ? post.selftext.replace(/\s+/g, " ").trim().slice(0, 240)
    : null;
  return {
    source: "reddit",
    tab: "news",
    url: externalUrl,
    title: post.title,
    snippet,
    eventDate: new Date(post.created_utc * 1000).toISOString(),
    points: post.score,
    comments: post.num_comments,
    faviconUrl: "https://www.reddit.com/favicon.ico",
  };
}
