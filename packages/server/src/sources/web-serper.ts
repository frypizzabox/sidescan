import { logger } from "@/lib/logger.js";
import type { Finding, SearchOptions, Source } from "@/sources/source.js";
import { dedupeAndCap } from "@/sources/source.js";

interface SerperOrganic {
  title: string;
  link: string;
  snippet?: string;
  date?: string;
}

interface SerperResponse {
  organic?: SerperOrganic[];
}

const ENDPOINT = "https://google.serper.dev/search";

export class SerperWebSource implements Source {
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
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn(
          { source: "web", query, err: msg },
          "Serper search failed",
        );
      }
    }

    return dedupeAndCap(all, maxFindings);
  }

  private async searchOne(
    query: string,
    limit: number,
  ): Promise<Finding[]> {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": this.apiKey!,
      },
      body: JSON.stringify({ q: query, num: limit }),
    });
    if (!res.ok) {
      throw new Error(`Serper ${res.status}: ${await res.text()}`);
    }
    const body = (await res.json()) as SerperResponse;
    const organic = body.organic ?? [];

    return organic.map(
      (r): Finding => ({
        source: "web",
        tab: "news",
        url: r.link,
        title: r.title,
        snippet: r.snippet ?? null,
        eventDate: r.date ?? null,
      }),
    );
  }
}
