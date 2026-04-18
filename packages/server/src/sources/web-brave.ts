import { logger } from "@/lib/logger.js";
import type { Finding, SearchOptions, Source } from "@/sources/source.js";
import { dedupeAndCap } from "@/sources/source.js";

interface BraveWebResult {
  title: string;
  url: string;
  description?: string;
  age?: string;
  page_age?: string;
}

interface BraveResponse {
  web?: { results?: BraveWebResult[] };
}

const ENDPOINT = "https://api.search.brave.com/res/v1/web/search";

export class BraveWebSource implements Source {
  readonly name = "web" as const;
  readonly tab = "news" as const;
  readonly ready: boolean;

  constructor(private readonly apiKey: string | null) {
    this.ready = !!apiKey;
  }

  async search(opts: SearchOptions): Promise<Finding[]> {
    if (!this.apiKey) return [];
    const perQueryLimit = opts.perQueryLimit ?? 10;
    const maxFindings = opts.maxFindings ?? 50;
    const all: Finding[] = [];

    for (const query of opts.queries) {
      try {
        const results = await this.searchOne(query, perQueryLimit);
        all.push(...results);
        // Brave free tier is ~1 req/sec; space them out.
        await sleep(1100);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn({ source: "web", query, err: msg }, "Brave search failed");
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
      count: String(limit),
    });
    const res = await fetch(`${ENDPOINT}?${params.toString()}`, {
      headers: {
        Accept: "application/json",
        "X-Subscription-Token": this.apiKey!,
      },
    });
    if (!res.ok) {
      throw new Error(`Brave ${res.status}: ${await res.text()}`);
    }
    const body = (await res.json()) as BraveResponse;
    const results = body.web?.results ?? [];

    return results.map(
      (r): Finding => ({
        source: "web",
        tab: "news",
        url: r.url,
        title: r.title,
        snippet: r.description?.replace(/<[^>]+>/g, "").trim() ?? null,
        eventDate: r.page_age ?? null,
      }),
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
