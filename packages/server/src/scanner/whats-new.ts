import type { AIProvider } from "@/ai/provider.js";
import { logger } from "@/lib/logger.js";
import type { Db } from "@/db/connection.js";
import { listNewFindingsSince, type NewFinding } from "@/db/findings.js";

const SYSTEM_PROMPT = `You are writing a short "what's new" digest for a solo developer.

You will receive the project's summary and a list of newly-discovered external findings (competitive intel, similar projects, etc). Pick the 3-5 most interesting items and write a tight, scannable paragraph grouping related ones. Be concrete. No hype, no bullet lists, no numbered lists.

If fewer than 3 findings are interesting, say so briefly and move on. Never invent findings.

Return plain text (no JSON, no markdown). Aim for 80-200 words.`;

/**
 * Produces a short natural-language digest of findings new to this scan.
 * Stored as ai_summary with kind='whats_new'.
 */
export async function generateWhatsNew(opts: {
  db: Db;
  provider: AIProvider;
  scanId: number;
  projectId: number;
  projectSummary: string;
}): Promise<{ content: string | null; cost: number }> {
  const newFindings = listNewFindingsSince(opts.db, opts.projectId, opts.scanId);
  if (newFindings.length === 0) {
    return { content: null, cost: 0 };
  }

  const topN = topByScore(newFindings, 20);
  try {
    const response = await opts.provider.chat({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: buildUserPrompt(opts.projectSummary, topN),
        },
      ],
      temperature: 0.1,
      responseFormat: "text",
      maxTokens: 600,
    });

    const content = response.content.trim();
    opts.db
      .prepare(
        `INSERT INTO ai_summary (scan_id, kind, content_md, created_at)
         VALUES (?, 'whats_new', ?, ?)`,
      )
      .run(opts.scanId, content, new Date().toISOString());

    return {
      content,
      cost: response.costEstimateUSD ?? 0,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ scanId: opts.scanId, err: msg }, "what's-new summary failed");
    return { content: null, cost: 0 };
  }
}

function topByScore(items: NewFinding[], n: number): NewFinding[] {
  return [...items]
    .sort((a, b) => (b.relevance_score ?? 0) - (a.relevance_score ?? 0))
    .slice(0, n);
}

function buildUserPrompt(summary: string, findings: NewFinding[]): string {
  const numbered = findings
    .map(
      (f, i) =>
        `${i + 1}. [${f.source}] ${f.title}\n   ${(f.snippet ?? "").slice(0, 180)}`,
    )
    .join("\n\n");

  return `PROJECT: ${summary}

NEW FINDINGS THIS SCAN (sorted by relevance):
${numbered}`;
}
