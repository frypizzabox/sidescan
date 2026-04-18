import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  analyzeRepo,
  formatContextForPrompt,
} from "@/scanner/repo-analyzer.js";

describe("repo-analyzer", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "sidescan-analyzer-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("detects a JS/TS repo via package.json and reads README", () => {
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ name: "my-app", description: "test app" }),
    );
    writeFileSync(join(dir, "README.md"), "# My App\n\nA test app.");
    writeFileSync(join(dir, "index.ts"), 'console.log("hi");');

    const ctx = analyzeRepo(dir);
    expect(ctx.detectedLanguage).toBe("javascript/typescript");
    expect(ctx.readme).toContain("My App");
    expect(ctx.manifest?.filename).toBe("package.json");
    expect(ctx.fileTree).toContain("index.ts");
    expect(ctx.keyFiles.some((f) => f.path === "index.ts")).toBe(true);
  });

  it("detects a Rust repo via Cargo.toml", () => {
    writeFileSync(
      join(dir, "Cargo.toml"),
      '[package]\nname = "my-rust"\nversion = "0.1.0"\n',
    );
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "src", "lib.rs"), 'pub fn hi() {}');

    const ctx = analyzeRepo(dir);
    expect(ctx.detectedLanguage).toBe("rust");
    expect(ctx.manifest?.filename).toBe("Cargo.toml");
    expect(ctx.fileTree).toContain("src/");
    expect(ctx.fileTree).toContain("src/lib.rs");
  });

  it("ignores node_modules and .git", () => {
    writeFileSync(join(dir, "package.json"), "{}");
    mkdirSync(join(dir, "node_modules", "dep"), { recursive: true });
    writeFileSync(join(dir, "node_modules", "dep", "index.js"), "leak");
    mkdirSync(join(dir, ".git"));
    writeFileSync(join(dir, ".git", "HEAD"), "leak");

    const ctx = analyzeRepo(dir);
    const asString = ctx.fileTree.join("\n");
    expect(asString).not.toContain("node_modules");
    expect(asString).not.toContain(".git");
  });

  it("truncates oversized READMEs", () => {
    const huge = "a".repeat(20000);
    writeFileSync(join(dir, "README.md"), huge);
    const ctx = analyzeRepo(dir);
    expect(ctx.readme!.length).toBeLessThan(huge.length);
    expect(ctx.readme!.endsWith("[...truncated]")).toBe(true);
  });

  it("returns null manifest + language when no manifest exists", () => {
    writeFileSync(join(dir, "README.md"), "# Just text");
    const ctx = analyzeRepo(dir);
    expect(ctx.manifest).toBeNull();
    expect(ctx.detectedLanguage).toBeNull();
    expect(ctx.readme).toContain("Just text");
  });

  it("formatContextForPrompt produces a readable text blob", () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "x" }));
    writeFileSync(join(dir, "README.md"), "# X");
    const ctx = analyzeRepo(dir);
    const text = formatContextForPrompt(ctx);
    expect(text).toContain("README");
    expect(text).toContain("MANIFEST (package.json)");
    expect(text).toContain("FILE TREE");
  });

  it("throws when path is not a directory", () => {
    expect(() => analyzeRepo(join(dir, "nonexistent"))).toThrow();
  });
});
