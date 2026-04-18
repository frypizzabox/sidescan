import { describe, it, expect } from "vitest";
import { parseRepoSpec, describeSpec } from "@/scanner/repo-spec.js";
import { ConfigError } from "@/lib/errors.js";

describe("parseRepoSpec", () => {
  it("parses https GitHub URL", () => {
    const spec = parseRepoSpec("https://github.com/frypizzabox/sidescan");
    expect(spec).toEqual({
      type: "github",
      owner: "frypizzabox",
      repo: "sidescan",
      branch: null,
      url: "https://github.com/frypizzabox/sidescan",
    });
  });

  it("tolerates trailing slash and .git suffix", () => {
    const s1 = parseRepoSpec("https://github.com/frypizzabox/sidescan/");
    const s2 = parseRepoSpec("https://github.com/frypizzabox/sidescan.git");
    expect(s1).toMatchObject({ type: "github", repo: "sidescan" });
    expect(s2).toMatchObject({ type: "github", repo: "sidescan" });
  });

  it("parses SSH GitHub URL", () => {
    const spec = parseRepoSpec("git@github.com:frypizzabox/sidescan.git");
    expect(spec).toEqual({
      type: "github",
      owner: "frypizzabox",
      repo: "sidescan",
      branch: null,
      url: "https://github.com/frypizzabox/sidescan",
    });
  });

  it("carries branch through when given", () => {
    const spec = parseRepoSpec(
      "https://github.com/owner/repo",
      "develop",
    );
    expect(spec).toMatchObject({ type: "github", branch: "develop" });
  });

  it("parses absolute local path", () => {
    const spec = parseRepoSpec("/Users/adalberto/Projects/web/sidescan");
    expect(spec).toEqual({
      type: "local",
      path: "/Users/adalberto/Projects/web/sidescan",
    });
  });

  it("expands ~ in local paths", () => {
    const spec = parseRepoSpec("~/Projects/web/sidescan");
    expect(spec.type).toBe("local");
    if (spec.type === "local") {
      expect(spec.path).not.toContain("~");
      expect(spec.path).toContain("Projects/web/sidescan");
    }
  });

  it("rejects relative paths and ambiguous strings", () => {
    expect(() => parseRepoSpec("relative/path")).toThrow(ConfigError);
    expect(() => parseRepoSpec("github.com/owner/repo")).toThrow(ConfigError);
    expect(() => parseRepoSpec("")).toThrow(); // zod min-length
  });

  it("describeSpec formats GitHub + local for logs", () => {
    const gh = parseRepoSpec("https://github.com/owner/repo", "develop");
    expect(describeSpec(gh)).toBe("https://github.com/owner/repo (develop)");

    const ghNoBranch = parseRepoSpec("https://github.com/owner/repo");
    expect(describeSpec(ghNoBranch)).toBe("https://github.com/owner/repo");

    const local = parseRepoSpec("/tmp/thing");
    expect(describeSpec(local)).toBe("/tmp/thing");
  });
});
