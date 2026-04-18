import type { AIProvider } from "@/ai/provider.js";
import { RuntimeError } from "@/lib/errors.js";
import {
  analyzeRepo,
  formatContextForPrompt,
  type RepoContext,
} from "@/scanner/repo-analyzer.js";

export interface RepoInference {
  /** One-paragraph description of what the project is. */
  summary: string;
  /** 6-8 search queries for finding similar or competing work. */
  search_queries: string[];
  /** Raw AI model used, for logging. */
  model: string;
  inputTokens: number;
  outputTokens: number;
  costEstimateUSD: number | null;
}

const SYSTEM_PROMPT = `You are a research assistant analyzing software projects.

You will receive a bundle of files from a single repository: README, manifest, file tree, and a few key source files.

Your job is to:
1. Summarize what the project is — one paragraph, 2-4 sentences. Concrete about what it does and who it's for. No hype.
2. Generate 6-8 search queries that would surface similar projects, competitors, or adjacent work on HackerNews, Product Hunt, GitHub, and the web. Queries should be specific (not generic like "web app" or "CLI tool"). Mix of:
   - Exact technical categories (e.g., "self-hosted analytics", "TUI task manager")
   - Problem-space phrases (e.g., "alternative to Octolens", "GitHub dependency insights")
   - Technology combinations if distinctive (e.g., "React Native + SQLite local-first")

Return a single JSON object. No prose, no markdown fences.

Format:
{
  "summary": "string",
  "search_queries": ["string", ...]
}`;

/**
 * Analyzes a repo and asks the AI for inference + search queries.
 * Returns parsed + validated response. Throws RuntimeError on malformed output.
 */
export async function inferRepo(
  provider: AIProvider,
  repoPath: string,
): Promise<{ context: RepoContext; inference: RepoInference }> {
  const context = analyzeRepo(repoPath);
  const userPrompt = formatContextForPrompt(context);

  const response = await provider.chat({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    temperature: 0,
    maxTokens: 1024,
    responseFormat: "json",
  });

  const parsed = parseInferenceJSON(response.content);

  return {
    context,
    inference: {
      summary: parsed.summary,
      search_queries: parsed.search_queries,
      model: response.model,
      inputTokens: response.inputTokens ?? 0,
      outputTokens: response.outputTokens ?? 0,
      costEstimateUSD: response.costEstimateUSD ?? null,
    },
  };
}

/**
 * Extracts JSON from an AI response that may be wrapped in markdown
 * fences or have surrounding commentary despite instructions.
 */
export function parseInferenceJSON(raw: string): {
  summary: string;
  search_queries: string[];
} {
  const jsonText = stripFences(raw).trim();
  let obj: unknown;
  try {
    obj = JSON.parse(jsonText);
  } catch (err) {
    throw new RuntimeError(
      `AI returned invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (typeof obj !== "object" || obj === null) {
    throw new RuntimeError("AI JSON was not an object");
  }
  const rec = obj as Record<string, unknown>;
  const summary = rec["summary"];
  const queries = rec["search_queries"];
  if (typeof summary !== "string" || summary.length === 0) {
    throw new RuntimeError("AI response missing `summary` (string)");
  }
  if (!Array.isArray(queries) || queries.some((q) => typeof q !== "string")) {
    throw new RuntimeError("AI response missing `search_queries` (string[])");
  }
  if (queries.length < 3) {
    throw new RuntimeError(
      `AI returned only ${queries.length} search queries; expected 6-8`,
    );
  }
  return { summary, search_queries: queries as string[] };
}

function stripFences(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  const firstNewline = trimmed.indexOf("\n");
  if (firstNewline === -1) return trimmed;
  const withoutOpener = trimmed.slice(firstNewline + 1);
  const closer = withoutOpener.lastIndexOf("```");
  if (closer === -1) return withoutOpener;
  return withoutOpener.slice(0, closer);
}
