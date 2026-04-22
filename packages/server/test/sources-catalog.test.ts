import { describe, it, expect, afterEach } from "vitest";
import { RedditSource } from "@/sources/reddit.js";
import { LobstersSource } from "@/sources/lobsters.js";
import { DevToSource, normaliseTag } from "@/sources/devto.js";

function fetchMock(byPattern: Record<string, unknown>): typeof fetch {
  const entries = Object.entries(byPattern).sort(
    (a, b) => b[0].length - a[0].length,
  );
  return (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    for (const [pattern, body] of entries) {
      if (url.includes(pattern)) {
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
    }
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
}

describe("RedditSource", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("maps reddit listings to findings with external URLs", async () => {
    globalThis.fetch = fetchMock({
      "reddit.com/search.json": {
        data: {
          children: [
            {
              data: {
                title: "Awesome tool",
                url: "https://example.com/tool",
                permalink: "/r/programming/comments/abc/awesome_tool/",
                score: 120,
                num_comments: 14,
                created_utc: 1712000000,
                subreddit: "programming",
              },
            },
          ],
        },
      },
    });

    const result = await new RedditSource().search({ queries: ["tool"] });
    expect(result).toHaveLength(1);
    expect(result[0]!.source).toBe("reddit");
    expect(result[0]!.url).toBe("https://example.com/tool");
    expect(result[0]!.points).toBe(120);
    expect(result[0]!.comments).toBe(14);
    expect(result[0]!.eventDate).toBeTruthy();
  });

  it("falls back to reddit permalink for self-posts", async () => {
    globalThis.fetch = fetchMock({
      "reddit.com/search.json": {
        data: {
          children: [
            {
              data: {
                title: "Discussion thread",
                url: "https://www.reddit.com/r/x/comments/xyz/discussion/",
                permalink: "/r/x/comments/xyz/discussion/",
                score: 5,
                num_comments: 2,
                created_utc: 1712000000,
                subreddit: "x",
                selftext: "body body body",
              },
            },
          ],
        },
      },
    });

    const result = await new RedditSource().search({ queries: ["x"] });
    expect(result[0]!.url).toBe(
      "https://www.reddit.com/r/x/comments/xyz/discussion/",
    );
    expect(result[0]!.snippet).toBe("body body body");
  });

  it("filters NSFW posts", async () => {
    globalThis.fetch = fetchMock({
      "reddit.com/search.json": {
        data: {
          children: [
            {
              data: {
                title: "Safe",
                url: "https://example.com/safe",
                permalink: "/r/x/1",
                score: 1,
                num_comments: 0,
                created_utc: 1712000000,
                subreddit: "x",
              },
            },
            {
              data: {
                title: "Nope",
                url: "https://example.com/nsfw",
                permalink: "/r/y/2",
                score: 1,
                num_comments: 0,
                created_utc: 1712000000,
                subreddit: "y",
                over_18: true,
              },
            },
          ],
        },
      },
    });

    const result = await new RedditSource().search({ queries: ["q"] });
    expect(result.map((r) => r.title)).toEqual(["Safe"]);
  });

  it("filters posts older than the `since` cutoff", async () => {
    globalThis.fetch = fetchMock({
      "reddit.com/search.json": {
        data: {
          children: [
            {
              data: {
                title: "Recent",
                url: "https://example.com/recent",
                permalink: "/r/x/1",
                score: 0,
                num_comments: 0,
                created_utc: Math.floor(Date.now() / 1000),
                subreddit: "x",
              },
            },
            {
              data: {
                title: "Old",
                url: "https://example.com/old",
                permalink: "/r/x/2",
                score: 0,
                num_comments: 0,
                created_utc: 1000000000,
                subreddit: "x",
              },
            },
          ],
        },
      },
    });

    const result = await new RedditSource().search({
      queries: ["q"],
      since: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    });
    expect(result.map((r) => r.title)).toEqual(["Recent"]);
  });

  it("sends a User-Agent header", async () => {
    let seenUA: string | null = null;
    globalThis.fetch = (async (
      _input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      seenUA = new Headers(init?.headers).get("User-Agent");
      return new Response(
        JSON.stringify({ data: { children: [] } }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;

    await new RedditSource().search({ queries: ["q"] });
    expect(seenUA).toMatch(/sidescan/);
  });
});

describe("LobstersSource", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("maps lobsters search results (array response) to findings", async () => {
    globalThis.fetch = fetchMock({
      "lobste.rs/search": [
        {
          short_id: "abc",
          short_id_url: "https://lobste.rs/s/abc",
          title: "Thing",
          url: "https://example.com/thing",
          created_at: "2026-04-01T10:00:00Z",
          score: 17,
          comments_count: 3,
          description: "a description",
        },
      ],
    });

    const result = await new LobstersSource().search({ queries: ["thing"] });
    expect(result).toHaveLength(1);
    expect(result[0]!.source).toBe("lobsters");
    expect(result[0]!.url).toBe("https://example.com/thing");
    expect(result[0]!.points).toBe(17);
    expect(result[0]!.comments).toBe(3);
    expect(result[0]!.snippet).toBe("a description");
  });

  it("accepts a wrapped {stories: [...]} response shape", async () => {
    globalThis.fetch = fetchMock({
      "lobste.rs/search": {
        stories: [
          {
            short_id: "x",
            short_id_url: "https://lobste.rs/s/x",
            title: "X",
            url: "https://example.com/x",
            created_at: "2026-04-01T10:00:00Z",
            score: 1,
          },
        ],
      },
    });

    const result = await new LobstersSource().search({ queries: ["x"] });
    expect(result).toHaveLength(1);
    expect(result[0]!.title).toBe("X");
  });

  it("computes points from upvotes/downvotes when score is absent", async () => {
    globalThis.fetch = fetchMock({
      "lobste.rs/search": [
        {
          short_id: "x",
          short_id_url: "https://lobste.rs/s/x",
          title: "X",
          url: "https://example.com/x",
          created_at: "2026-04-01T10:00:00Z",
          upvotes: 10,
          downvotes: 3,
        },
      ],
    });

    const result = await new LobstersSource().search({ queries: ["x"] });
    expect(result[0]!.points).toBe(7);
  });

  it("filters stories older than since", async () => {
    globalThis.fetch = fetchMock({
      "lobste.rs/search": [
        {
          short_id: "new",
          short_id_url: "https://lobste.rs/s/new",
          title: "New",
          url: "https://example.com/new",
          created_at: "2026-04-20T00:00:00Z",
        },
        {
          short_id: "old",
          short_id_url: "https://lobste.rs/s/old",
          title: "Old",
          url: "https://example.com/old",
          created_at: "2020-01-01T00:00:00Z",
        },
      ],
    });

    const result = await new LobstersSource().search({
      queries: ["q"],
      since: "2026-04-15T00:00:00Z",
    });
    expect(result.map((r) => r.title)).toEqual(["New"]);
  });
});

describe("DevToSource", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("maps dev.to articles to findings", async () => {
    globalThis.fetch = fetchMock({
      "dev.to/api/articles": [
        {
          id: 1,
          title: "React hooks explained",
          description: "Explains hooks",
          url: "https://dev.to/ada/react-hooks-explained",
          published_at: "2026-04-01T12:00:00Z",
          positive_reactions_count: 50,
          comments_count: 5,
          cover_image: "https://dev.to/cover.png",
          tag_list: ["react"],
        },
      ],
    });

    const result = await new DevToSource().search({ queries: ["react"] });
    expect(result).toHaveLength(1);
    expect(result[0]!.source).toBe("devto");
    expect(result[0]!.url).toBe("https://dev.to/ada/react-hooks-explained");
    expect(result[0]!.points).toBe(50);
    expect(result[0]!.thumbnailUrl).toBe("https://dev.to/cover.png");
  });

  it("converts multi-word queries to the first usable tag", async () => {
    let seenUrl = "";
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      seenUrl = typeof input === "string" ? input : input.toString();
      return new Response("[]", {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    await new DevToSource().search({ queries: ["Retention Analytics tools"] });
    expect(seenUrl).toContain("tag=retention");
  });

  it("deduplicates tags across queries (same tag = one request)", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return new Response("[]", {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    await new DevToSource().search({
      queries: ["react tools", "react hooks", "react state"],
    });
    expect(calls).toBe(1);
  });

  it("filters articles older than since", async () => {
    globalThis.fetch = fetchMock({
      "dev.to/api/articles": [
        {
          id: 1,
          title: "New",
          description: "new",
          url: "https://dev.to/x/new",
          published_at: "2026-04-20T00:00:00Z",
          cover_image: null,
        },
        {
          id: 2,
          title: "Old",
          description: "old",
          url: "https://dev.to/x/old",
          published_at: "2020-01-01T00:00:00Z",
          cover_image: null,
        },
      ],
    });

    const result = await new DevToSource().search({
      queries: ["react"],
      since: "2026-04-15T00:00:00Z",
    });
    expect(result.map((r) => r.title)).toEqual(["New"]);
  });
});

describe("normaliseTag", () => {
  it("returns first meaningful token", () => {
    expect(normaliseTag("React hooks state")).toBe("react");
  });
  it("strips punctuation", () => {
    expect(normaliseTag("node.js ecosystem")).toBe("nodejs");
  });
  it("skips sub-3-char tokens", () => {
    expect(normaliseTag("a big deal")).toBe("big");
  });
  it("returns null when nothing qualifies", () => {
    expect(normaliseTag("  x y  ")).toBeNull();
  });
});
