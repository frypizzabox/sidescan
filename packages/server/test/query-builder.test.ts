import { describe, it, expect } from "vitest";
import { parseInferenceJSON, inferRepo } from "@/scanner/query-builder.js";
import { RuntimeError } from "@/lib/errors.js";
import type { AIProvider, ChatResponse } from "@/ai/provider.js";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("parseInferenceJSON", () => {
  it("parses valid JSON", () => {
    const result = parseInferenceJSON(
      JSON.stringify({
        summary: "A cool tool",
        search_queries: ["a", "b", "c", "d", "e", "f"],
      }),
    );
    expect(result.summary).toBe("A cool tool");
    expect(result.search_queries).toHaveLength(6);
  });

  it("strips markdown fences", () => {
    const wrapped = '```json\n{"summary":"ok","search_queries":["a","b","c"]}\n```';
    const result = parseInferenceJSON(wrapped);
    expect(result.summary).toBe("ok");
  });

  it("rejects invalid JSON", () => {
    expect(() => parseInferenceJSON("not json")).toThrow(RuntimeError);
  });

  it("rejects missing summary", () => {
    expect(() =>
      parseInferenceJSON(JSON.stringify({ search_queries: ["a", "b", "c"] })),
    ).toThrow(/summary/);
  });

  it("rejects missing search_queries", () => {
    expect(() =>
      parseInferenceJSON(JSON.stringify({ summary: "yes" })),
    ).toThrow(/search_queries/);
  });

  it("rejects too few queries", () => {
    expect(() =>
      parseInferenceJSON(
        JSON.stringify({ summary: "yes", search_queries: ["a"] }),
      ),
    ).toThrow(/only 1/);
  });
});

describe("inferRepo with mocked provider", () => {
  function makeProvider(content: string): AIProvider {
    return {
      name: "claude",
      defaultModel: "test-model",
      chat: async (): Promise<ChatResponse> => ({
        content,
        model: "test-model",
        inputTokens: 100,
        outputTokens: 50,
        costEstimateUSD: 0.001,
      }),
    };
  }

  it("runs analyze + AI + parse and returns structured result", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sidescan-infer-"));
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "demo" }));
    writeFileSync(join(dir, "README.md"), "# Demo");

    try {
      const provider = makeProvider(
        JSON.stringify({
          summary: "Demo project",
          search_queries: ["q1", "q2", "q3", "q4", "q5", "q6"],
        }),
      );
      const { inference, context } = await inferRepo(
        provider,
        { type: "local", path: dir },
        null,
      );
      expect(inference.summary).toBe("Demo project");
      expect(inference.search_queries).toHaveLength(6);
      expect(inference.inputTokens).toBe(100);
      expect(inference.outputTokens).toBe(50);
      expect(inference.costEstimateUSD).toBe(0.001);
      expect(context.detectedLanguage).toBe("javascript/typescript");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("propagates AI errors as RuntimeError", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sidescan-infer-err-"));
    writeFileSync(join(dir, "README.md"), "# x");
    try {
      const provider = makeProvider("this is not json");
      await expect(
        inferRepo(provider, { type: "local", path: dir }, null),
      ).rejects.toThrow(RuntimeError);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
