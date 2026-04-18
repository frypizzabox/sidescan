import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { HNSource } from "@/sources/hn.js";
import { GitHubSimilarSource } from "@/sources/github-similar.js";
import { BraveWebSource } from "@/sources/web-brave.js";
import { SerperWebSource } from "@/sources/web-serper.js";
import { dedupeAndCap, type Finding } from "@/sources/source.js";

function fetchMock(mapping: Record<string, unknown>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    const match = Object.entries(mapping).find(([pattern]) =>
      url.includes(pattern),
    );
    if (!match) throw new Error(`Unexpected fetch to ${url}`);
    return new Response(JSON.stringify(match[1]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

describe("dedupeAndCap", () => {
  it("removes duplicate (source, url) pairs", () => {
    const input: Finding[] = [
      {
        source: "hn",
        tab: "news",
        url: "https://a.test",
        title: "A",
        snippet: null,
        eventDate: null,
      },
      {
        source: "hn",
        tab: "news",
        url: "https://a.test",
        title: "A again",
        snippet: null,
        eventDate: null,
      },
      {
        source: "hn",
        tab: "news",
        url: "https://b.test",
        title: "B",
        snippet: null,
        eventDate: null,
      },
    ];
    const out = dedupeAndCap(input, 10);
    expect(out).toHaveLength(2);
    expect(out[0]!.title).toBe("A");
  });

  it("caps at maxFindings", () => {
    const findings: Finding[] = Array.from({ length: 50 }, (_, i) => ({
      source: "hn" as const,
      tab: "news" as const,
      url: `https://x.test/${i}`,
      title: `item ${i}`,
      snippet: null,
      eventDate: null,
    }));
    expect(dedupeAndCap(findings, 20)).toHaveLength(20);
  });
});

describe("HNSource", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns story findings with external URLs", async () => {
    globalThis.fetch = fetchMock({
      "hn.algolia.com": {
        hits: [
          {
            objectID: "1",
            title: "Some cool tool",
            url: "https://example.com/tool",
            created_at: "2026-03-01T10:00:00Z",
            points: 42,
          },
        ],
        nbHits: 1,
      },
    });

    const source = new HNSource();
    const result = await source.search({ queries: ["cool tool"] });
    expect(result).toHaveLength(1);
    expect(result[0]!.url).toBe("https://example.com/tool");
    expect(result[0]!.title).toBe("Some cool tool");
    expect(result[0]!.snippet).toContain("42 points");
    expect(result[0]!.source).toBe("hn");
  });

  it("falls back to HN item URL when story has no external url", async () => {
    globalThis.fetch = fetchMock({
      "hn.algolia.com": {
        hits: [
          {
            objectID: "42",
            story_id: 42,
            title: "Ask HN: thing",
            created_at: "2026-03-01T10:00:00Z",
          },
        ],
        nbHits: 1,
      },
    });
    const result = await new HNSource().search({ queries: ["thing"] });
    expect(result[0]!.url).toBe("https://news.ycombinator.com/item?id=42");
  });

  it("dedupes across multiple queries", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return new Response(
        JSON.stringify({
          hits: [
            {
              objectID: "1",
              title: "Same",
              url: "https://same.test",
              created_at: "2026-03-01T00:00:00Z",
            },
          ],
          nbHits: 1,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;

    const result = await new HNSource().search({
      queries: ["q1", "q2", "q3"],
    });
    expect(calls).toBe(3);
    expect(result).toHaveLength(1);
  });
});

describe("GitHubSimilarSource", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("maps repos to findings with similarity score", async () => {
    globalThis.fetch = fetchMock({
      "api.github.com/search/repositories": {
        total_count: 1,
        items: [
          {
            id: 1,
            full_name: "acme/widget",
            name: "widget",
            html_url: "https://github.com/acme/widget",
            description: "A widget",
            stargazers_count: 1500,
            language: "Rust",
            pushed_at: "2026-03-01T00:00:00Z",
            created_at: "2025-01-01T00:00:00Z",
            updated_at: "2026-03-01T00:00:00Z",
            score: 10,
          },
        ],
      },
    });
    const source = new GitHubSimilarSource(null);
    const result = await source.search({ queries: ["rust widget"] });
    expect(result).toHaveLength(1);
    expect(result[0]!.title).toBe("acme/widget");
    expect(result[0]!.tab).toBe("github");
    expect(result[0]!.similarityScore).toBeGreaterThan(0);
    expect(result[0]!.snippet).toContain("★");
    expect(result[0]!.snippet).toContain("Rust");
  });

  it("passes Authorization header when token is provided", async () => {
    let seenAuth: string | null = null;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      seenAuth = headers.get("Authorization");
      return new Response(JSON.stringify({ total_count: 0, items: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    await new GitHubSimilarSource("ghp_test").search({ queries: ["q"] });
    expect(seenAuth).toBe("Bearer ghp_test");
  });
});

describe("BraveWebSource", () => {
  it("is not ready without a key", () => {
    const s = new BraveWebSource(null);
    expect(s.ready).toBe(false);
  });
  it("returns empty array without a key", async () => {
    const result = await new BraveWebSource(null).search({ queries: ["x"] });
    expect(result).toEqual([]);
  });
});

describe("SerperWebSource", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  it("posts to Serper and returns organic results", async () => {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      expect(url).toContain("google.serper.dev");
      expect(init?.method).toBe("POST");
      const body = JSON.parse(init?.body as string) as { q: string };
      expect(body.q).toBe("test query");
      return new Response(
        JSON.stringify({
          organic: [
            {
              title: "A result",
              link: "https://a.test",
              snippet: "some snippet",
              date: "2026-03-01",
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;

    const result = await new SerperWebSource("key").search({
      queries: ["test query"],
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.url).toBe("https://a.test");
    expect(result[0]!.tab).toBe("news");
  });
});
