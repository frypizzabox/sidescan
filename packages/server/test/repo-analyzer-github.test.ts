import { describe, it, expect, afterEach } from "vitest";
import { analyzeGitHubRepo } from "@/scanner/repo-analyzer-github.js";

const SPEC = {
  type: "github" as const,
  owner: "acme",
  repo: "widget",
  branch: null,
  url: "https://github.com/acme/widget",
};

function fetchMock(
  byUrl: Record<string, { status?: number; body: unknown; raw?: boolean }>,
): typeof fetch {
  // Longest (most specific) pattern wins so /repos/acme/widget/readme
  // matches before /repos/acme/widget.
  const patterns = Object.entries(byUrl).sort(
    (a, b) => b[0].length - a[0].length,
  );
  return (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    for (const [pattern, conf] of patterns) {
      if (url.includes(pattern)) {
        const status = conf.status ?? 200;
        if (conf.raw) {
          return new Response(conf.body as string, {
            status,
            headers: { "content-type": "text/plain" },
          });
        }
        return new Response(JSON.stringify(conf.body), {
          status,
          headers: { "content-type": "application/json" },
        });
      }
    }
    return new Response("not mocked", { status: 404 });
  }) as typeof fetch;
}

function base64(s: string): string {
  return Buffer.from(s, "utf8").toString("base64");
}

describe("analyzeGitHubRepo", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("fetches README, manifest, tree, and one key file", async () => {
    globalThis.fetch = fetchMock({
      "https://api.github.com/repos/acme/widget": {
        body: {
          default_branch: "main",
          language: "TypeScript",
        },
      },
      "https://api.github.com/repos/acme/widget/readme": {
        raw: true,
        body: "# Widget\n\nA demo widget.",
      },
      "https://api.github.com/repos/acme/widget/contents/package.json": {
        body: {
          type: "file",
          encoding: "base64",
          content: base64(JSON.stringify({ name: "widget" })),
          size: 20,
        },
      },
      "https://api.github.com/repos/acme/widget/git/trees/main": {
        body: {
          sha: "abc",
          tree: [
            { path: "README.md", type: "blob", sha: "r" },
            { path: "package.json", type: "blob", sha: "p" },
            { path: "src", type: "tree", sha: "s" },
            { path: "src/index.ts", type: "blob", sha: "i" },
          ],
          truncated: false,
        },
      },
      "https://api.github.com/repos/acme/widget/contents/src/index.ts": {
        body: {
          type: "file",
          encoding: "base64",
          content: base64('console.log("hi");'),
          size: 18,
        },
      },
    });

    const ctx = await analyzeGitHubRepo(SPEC, null);
    expect(ctx.path).toBe("https://github.com/acme/widget");
    expect(ctx.readme).toContain("Widget");
    expect(ctx.manifest?.filename).toBe("package.json");
    expect(ctx.detectedLanguage).toBe("javascript/typescript");
    expect(ctx.fileTree).toContain("src/");
    expect(ctx.fileTree).toContain("src/index.ts");
    expect(ctx.keyFiles.some((f) => f.path === "src/index.ts")).toBe(true);
  });

  it("skips manifest probes that 404 and picks the first one that exists", async () => {
    globalThis.fetch = fetchMock({
      "https://api.github.com/repos/acme/widget": {
        body: { default_branch: "main", language: null },
      },
      "https://api.github.com/repos/acme/widget/readme": {
        status: 404,
        body: {},
      },
      // First few manifests 404...
      "https://api.github.com/repos/acme/widget/contents/package.json": { status: 404, body: {} },
      "https://api.github.com/repos/acme/widget/contents/pyproject.toml": { status: 404, body: {} },
      "https://api.github.com/repos/acme/widget/contents/requirements.txt": {
        body: {
          type: "file",
          encoding: "base64",
          content: base64("requests==2.31"),
          size: 14,
        },
      },
      "https://api.github.com/repos/acme/widget/git/trees/main": {
        body: { sha: "abc", tree: [], truncated: false },
      },
    });

    const ctx = await analyzeGitHubRepo(SPEC, null);
    expect(ctx.readme).toBeNull();
    expect(ctx.manifest?.filename).toBe("requirements.txt");
    expect(ctx.detectedLanguage).toBe("python");
  });

  it("passes bearer token when provided", async () => {
    let seenAuth: string | null = null;
    globalThis.fetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      const headers = new Headers(init?.headers);
      if (!seenAuth) seenAuth = headers.get("Authorization");
      return new Response(
        JSON.stringify({ default_branch: "main", language: null }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;

    await analyzeGitHubRepo(SPEC, "ghp_test").catch(() => {});
    expect(seenAuth).toBe("Bearer ghp_test");
  });
});
