import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseConfig } from "@/config/parse.js";
import { ConfigError } from "@/lib/errors.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXAMPLE_YAML = join(__dirname, "..", "src", "config", "example.yaml");

describe("parseConfig", () => {
  it("parses the shipped example.yaml", () => {
    const text = readFileSync(EXAMPLE_YAML, "utf8");
    const config = parseConfig(text);

    expect(config.server.port).toBe(3000);
    expect(config.server.host).toBe("localhost");
    expect(config.providers.ai).toBe("claude");
    expect(config.providers.search).toBe("brave");
    expect(config.projects.length).toBeGreaterThan(0);

    const first = config.projects[0]!;
    expect(first.slug).toBe("example");
    expect(first.scan.frequency).toBe("weekly");
    expect(first.bootstrap_lookback_years).toBe(2);
    expect(first.repos[0]!.path).toContain("github.com/owner/repo");
  });

  it("applies defaults for missing optional fields", () => {
    const yaml = `
providers:
  ai: ollama
projects:
  - name: Test
    slug: test
    scan: { frequency: manual }
    repos:
      - path: /tmp/test
`;
    const config = parseConfig(yaml);
    expect(config.server.port).toBe(3000);
    expect(config.server.host).toBe("localhost");
    expect(config.providers.search).toBeNull();
    expect(config.sources.github.token_env).toBe("GITHUB_TOKEN");
    expect(config.projects[0]!.bootstrap_lookback_years).toBe(2);
  });

  it("rejects duplicate project slugs", () => {
    const yaml = `
providers: { ai: ollama }
projects:
  - name: A
    slug: dup
    scan: { frequency: manual }
    repos: [{ path: /tmp/a }]
  - name: B
    slug: dup
    scan: { frequency: manual }
    repos: [{ path: /tmp/b }]
`;
    expect(() => parseConfig(yaml)).toThrow(ConfigError);
    expect(() => parseConfig(yaml)).toThrow(/unique/i);
  });

  it("rejects invalid slug format", () => {
    const yaml = `
providers: { ai: ollama }
projects:
  - name: Bad Slug
    slug: Bad_Slug!
    scan: { frequency: manual }
    repos: [{ path: /tmp/x }]
`;
    expect(() => parseConfig(yaml)).toThrow(ConfigError);
  });

  it("rejects malformed YAML with a readable message", () => {
    expect(() => parseConfig("providers: { ai:\n  [broken")).toThrow(
      /Invalid YAML/,
    );
  });

  it("requires at least one project", () => {
    const yaml = `
providers: { ai: ollama }
projects: []
`;
    expect(() => parseConfig(yaml)).toThrow(ConfigError);
  });

  it("expands ~ in repo paths", () => {
    const yaml = `
providers: { ai: ollama }
projects:
  - name: T
    slug: t
    scan: { frequency: manual }
    repos:
      - path: ~/Projects/foo
`;
    const config = parseConfig(yaml);
    expect(config.projects[0]!.repos[0]!.path).not.toContain("~");
    expect(config.projects[0]!.repos[0]!.path).toContain("Projects/foo");
  });
});
