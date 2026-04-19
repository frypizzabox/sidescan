import { describe, it, expect } from "vitest";
import { githubRepoKey } from "@/lib/github-url.js";

describe("githubRepoKey", () => {
  it("normalizes https github urls", () => {
    expect(githubRepoKey("https://github.com/Owner/Repo")).toBe("owner/repo");
    expect(githubRepoKey("https://github.com/owner/repo/")).toBe("owner/repo");
    expect(githubRepoKey("https://github.com/owner/repo.git")).toBe(
      "owner/repo",
    );
    expect(githubRepoKey("https://github.com/owner/repo/tree/main")).toBe(
      "owner/repo",
    );
  });

  it("normalizes ssh github urls", () => {
    expect(githubRepoKey("git@github.com:owner/repo.git")).toBe("owner/repo");
    expect(githubRepoKey("git@github.com:Owner/Repo")).toBe("owner/repo");
  });

  it("returns null for non-github urls", () => {
    expect(githubRepoKey("https://gitlab.com/owner/repo")).toBeNull();
    expect(githubRepoKey("/Users/me/code/thing")).toBeNull();
    expect(githubRepoKey("")).toBeNull();
    expect(githubRepoKey("not-a-url")).toBeNull();
  });

  it("rejects malformed github urls", () => {
    expect(githubRepoKey("https://github.com/")).toBeNull();
    expect(githubRepoKey("https://github.com/owner")).toBeNull();
  });
});
