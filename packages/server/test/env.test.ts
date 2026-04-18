import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { parseConfig } from "@/config/parse.js";
import { resolveKeys, assertRequiredKeys } from "@/config/resolve-env.js";
import { ConfigError } from "@/lib/errors.js";

const MINIMAL_YAML = `
providers: { ai: claude, search: brave }
projects:
  - name: T
    slug: t
    scan: { frequency: manual }
    repos: [{ path: /tmp/t }]
`;

describe("resolveKeys + assertRequiredKeys", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env["ANTHROPIC_API_KEY"];
    delete process.env["BRAVE_API_KEY"];
    delete process.env["GITHUB_TOKEN"];
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("throws ConfigError when AI key is missing for claude", () => {
    const config = parseConfig(MINIMAL_YAML);
    const keys = resolveKeys(config);
    expect(() => assertRequiredKeys(config, keys)).toThrow(ConfigError);
    expect(() => assertRequiredKeys(config, keys)).toThrow(
      /ANTHROPIC_API_KEY/,
    );
  });

  it("does not throw when AI is ollama (no key needed)", () => {
    const config = parseConfig(
      MINIMAL_YAML.replace("ai: claude", "ai: ollama"),
    );
    const keys = resolveKeys(config);
    const warnings = assertRequiredKeys(config, keys);
    expect(warnings).toEqual(
      expect.arrayContaining([expect.stringMatching(/GITHUB_TOKEN/)]),
    );
  });

  it("warns when search key is missing but does not throw", () => {
    process.env["ANTHROPIC_API_KEY"] = "sk-test";
    const config = parseConfig(MINIMAL_YAML);
    const keys = resolveKeys(config);
    const warnings = assertRequiredKeys(config, keys);
    expect(warnings.some((w) => w.includes("BRAVE_API_KEY"))).toBe(true);
  });

  it("defaults ollama host to localhost:11434", () => {
    delete process.env["OLLAMA_HOST"];
    const config = parseConfig(
      MINIMAL_YAML.replace("ai: claude", "ai: ollama"),
    );
    const keys = resolveKeys(config);
    expect(keys.aiHost).toBe("http://localhost:11434");
  });

  it("honors OLLAMA_HOST override", () => {
    process.env["OLLAMA_HOST"] = "http://ollama.lan:11434";
    const config = parseConfig(
      MINIMAL_YAML.replace("ai: claude", "ai: ollama"),
    );
    const keys = resolveKeys(config);
    expect(keys.aiHost).toBe("http://ollama.lan:11434");
  });
});
