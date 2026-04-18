import type { AIProvider } from "@/ai/provider.js";
import { logger } from "@/lib/logger.js";
import type { Db } from "@/db/connection.js";
import type { Finding } from "@/sources/source.js";

const SYSTEM_PROMPT = `You are a research assistant scoring search results for relevance.

Given a project description and a list of findings (each has a title + snippet), score each finding from 0.0 to 1.0:
- 1.0 — directly relevant (competitor, similar project, same space)
- 0.7 — adjacent / worth a look
- 0.4 — weak match, may or may not be interesting
- 0.0 — off-topic, keyword match only

Return a single JSON object mapping finding index (as string) to score. No prose, no fences.

Example output:
{ "0": 0.9, "1": 0.4, "2": 0.0 }`;

interface RankerOutput {
  byIndex: Record<number, number>;
  inputTokens: number;
  outputTokens: number;
  costEstimateUSD: number;
}

/**
 * Asks the AI to score each finding 0-1 for relevance to the project.
 * Updates `finding.relevance_score`. Low-scoring (below threshold)
 * findings are auto-dismissed so they don't clutter the News tab.
 */
export async function rankFindings(opts: {
  db: Db;
  provider: AIProvider;
  projectSummary: string;
  scanId: number;
  findings: (Finding & { id?: number })[];
  autoDismissBelow?: number;
  batchSize?: number;
}): Promise<{
  scored: number;
  dismissed: number;
  cost: number;
}> {
  const autoDismissBelow = opts.autoDismissBelow ?? 0.2;
  const batchSize = opts.batchSize ?? 30;
  const all = opts.findings;
  if (all.length === 0) return { scored: 0, dismissed: 0, cost: 0 };

  let totalCost = 0;
  let scored = 0;
  let dismissed = 0;

  // Score in batches so a single call stays small.
  for (let i = 0; i < all.length; i += batchSize) {
    const batch = all.slice(i, i + batchSize);
    try {
      const output = await scoreBatch(opts.provider, opts.projectSummary, batch);
      totalCost += output.costEstimateUSD;

      const updateScore = opts.db.prepare(
        `UPDATE finding SET relevance_score = ? WHERE source = ? AND url = ?`,
      );
      const dismissStmt = opts.db.prepare(
        `UPDATE finding SET dismissed = 1 WHERE source = ? AND url = ?`,
      );
      const tx = opts.db.transaction(() => {
        for (const [indexStr, score] of Object.entries(output.byIndex)) {
          const idx = Number(indexStr);
          const f = batch[idx];
          if (!f) continue;
          updateScore.run(score, f.source, f.url);
          scored++;
          if (score < autoDismissBelow) {
            dismissStmt.run(f.source, f.url);
            dismissed++;
          }
        }
      });
      tx();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(
        { scanId: opts.scanId, err: msg, batchStart: i },
        "Ranker batch failed",
      );
    }
  }

  return { scored, dismissed, cost: totalCost };
}

async function scoreBatch(
  provider: AIProvider,
  projectSummary: string,
  batch: (Finding & { id?: number })[],
): Promise<RankerOutput> {
  const numbered = batch
    .map(
      (f, i) =>
        `${i}. [${f.source}] ${f.title}\n   ${(f.snippet ?? "").slice(0, 240)}`,
    )
    .join("\n\n");

  const user = `PROJECT: ${projectSummary}

FINDINGS (score each 0.0 - 1.0):
${numbered}`;

  const response = await provider.chat({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: user },
    ],
    temperature: 0,
    responseFormat: "json",
    maxTokens: 1024,
  });

  const byIndex = parseScoreJSON(response.content);
  return {
    byIndex,
    inputTokens: response.inputTokens ?? 0,
    outputTokens: response.outputTokens ?? 0,
    costEstimateUSD: response.costEstimateUSD ?? 0,
  };
}

function parseScoreJSON(raw: string): Record<number, number> {
  const trimmed = raw
    .trim()
    .replace(/^```(?:json)?\n?/, "")
    .replace(/\n?```$/, "");
  const obj = JSON.parse(trimmed) as Record<string, unknown>;
  const result: Record<number, number> = {};
  for (const [k, v] of Object.entries(obj)) {
    const idx = Number(k);
    const score = typeof v === "number" ? v : Number(v);
    if (Number.isFinite(idx) && Number.isFinite(score)) {
      result[idx] = Math.max(0, Math.min(1, score));
    }
  }
  return result;
}
