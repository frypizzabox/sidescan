import type { AIProvider } from "@/ai/provider.js";
import { logger } from "@/lib/logger.js";
import type { Db } from "@/db/connection.js";

/**
 * Insights — two panels per scan:
 *   - market: "what peers built recently"
 *   - suggestions: "next steps for you, grounded in peer work + your commits"
 *
 * Both are cached as ai_summary rows (content_md = JSON string) so the API
 * can return the most recent scan's output without re-asking the AI.
 * Every bullet cites the `findingId` of the source it's based on — items
 * without a valid citation are discarded to contain hallucination risk.
 */

interface InsightBullet {
  title: string;
  rationale: string;
  findingIds: number[];
}

interface InsightsPayload {
  market: InsightBullet[];
  suggestions: InsightBullet[];
}

interface ContextFinding {
  id: number;
  source: string;
  title: string;
  snippet: string | null;
  url: string;
  points: number | null;
  owner: string | null;
  repoName: string | null;
  description: string | null;
  stars: number | null;
  language: string | null;
  lastPushedAt: string | null;
}

interface OwnActivity {
  kind: "commit" | "release" | "issue" | "pr";
  ref: string;
  title: string;
  eventDate: string;
}

const SYSTEM_PROMPT = `You advise a solo developer building a product. You'll see:
  • PROJECT — description of what the user is building.
  • OWN_ACTIVITY — recent commits/releases/PRs from their own repo (last 60 days).
  • PEER_COMPETITORS — similar GitHub repos with metadata.
  • DISCUSSION — news/forum items discussed in their space.

Output JSON with two arrays:

{
  "market": [          // 3-6 items about what peers or the community shipped/discussed recently
    { "title": "Short bullet (<=80 chars)", "rationale": "Why it matters (1-2 sentences).", "findingIds": [123] }
  ],
  "suggestions": [     // 3-5 concrete next-step ideas for the user
    { "title": "Actionable suggestion (<=80 chars)", "rationale": "Why — reference peers and acknowledge what the user already has.", "findingIds": [456, 789] }
  ]
}

Rules:
  • Every bullet MUST include at least one findingId drawn from the provided list.
  • Use OWN_ACTIVITY to avoid suggesting work the user already shipped or is doing.
  • Suggestions should be concrete (e.g. "add digest emails", "publish a comparison page"), not platitudes.
  • If the data is too thin to produce good items, return fewer items rather than padding.
  • No prose outside the JSON. No markdown fences.`;

export async function generateInsights(opts: {
  db: Db;
  provider: AIProvider;
  scanId: number;
  projectId: number;
  projectSummary: string;
}): Promise<{ content: InsightsPayload | null; cost: number }> {
  const findings = loadContextFindings(opts.db, opts.projectId);
  const ownActivity = loadOwnActivity(opts.db, opts.projectId);

  const peerCount = findings.filter(
    (f) => f.source === "github_similar",
  ).length;
  const discussionCount = findings.length - peerCount;

  if (peerCount === 0 && discussionCount < 5) {
    return { content: null, cost: 0 };
  }

  const userPrompt = buildUserPrompt(opts.projectSummary, findings, ownActivity);

  let cost = 0;
  try {
    const response = await opts.provider.chat({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
      responseFormat: "json",
      maxTokens: 2000,
    });
    cost = response.costEstimateUSD ?? 0;

    const parsed = safeParseJson(response.content);
    if (!parsed) {
      logger.warn({ scanId: opts.scanId }, "insights JSON unparseable");
      return { content: null, cost };
    }

    const validFindingIds = new Set(findings.map((f) => f.id));
    const cleaned: InsightsPayload = {
      market: sanitizeBullets(parsed.market, validFindingIds),
      suggestions: sanitizeBullets(parsed.suggestions, validFindingIds),
    };

    const nowISO = new Date().toISOString();
    const insert = opts.db.prepare(
      `INSERT INTO ai_summary (scan_id, kind, content_md, created_at)
       VALUES (?, ?, ?, ?)`,
    );
    insert.run(
      opts.scanId,
      "insights_market",
      JSON.stringify(cleaned.market),
      nowISO,
    );
    insert.run(
      opts.scanId,
      "insights_suggestions",
      JSON.stringify(cleaned.suggestions),
      nowISO,
    );

    return { content: cleaned, cost };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ scanId: opts.scanId, err: msg }, "insights generation failed");
    return { content: null, cost };
  }
}

function loadContextFindings(db: Db, projectId: number): ContextFinding[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);

  return db
    .prepare<
      [number, string, string],
      {
        id: number;
        source: string;
        title: string;
        snippet: string | null;
        url: string;
        points: number | null;
        owner: string | null;
        repo_name: string | null;
        description: string | null;
        stars: number | null;
        language: string | null;
        last_pushed_at: string | null;
      }
    >(
      `SELECT f.id, f.source, f.title, f.snippet, f.url, f.points,
              f.owner, f.repo_name, f.description, f.stars, f.language,
              f.last_pushed_at
       FROM finding f
       JOIN scan s ON f.scan_id = s.id
       JOIN repo r ON s.repo_id = r.id
       WHERE r.project_id = ?
         AND f.dismissed = 0
         AND (
           (f.source = 'github_similar')
           OR (f.event_date >= ? OR f.created_at >= ?)
         )
       ORDER BY
         CASE WHEN f.source = 'github_similar' THEN 0 ELSE 1 END,
         COALESCE(f.relevance_score, 0) DESC,
         COALESCE(f.points, 0) DESC
       LIMIT 40`,
    )
    .all(projectId, cutoff.toISOString(), cutoff.toISOString())
    .map((r) => ({
      id: r.id,
      source: r.source,
      title: r.title,
      snippet: r.snippet,
      url: r.url,
      points: r.points,
      owner: r.owner,
      repoName: r.repo_name,
      description: r.description,
      stars: r.stars,
      language: r.language,
      lastPushedAt: r.last_pushed_at,
    }));
}

function loadOwnActivity(db: Db, projectId: number): OwnActivity[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 60);

  return db
    .prepare<
      [number, string],
      {
        kind: "commit" | "release" | "issue" | "pr";
        ref: string;
        title: string;
        event_date: string;
      }
    >(
      `SELECT a.kind, a.ref, a.title, a.event_date
       FROM repo_activity a
       JOIN repo r ON a.repo_id = r.id
       WHERE r.project_id = ?
         AND a.event_date >= ?
       ORDER BY
         CASE a.kind WHEN 'release' THEN 0 WHEN 'pr' THEN 1 ELSE 2 END,
         a.event_date DESC
       LIMIT 80`,
    )
    .all(projectId, cutoff.toISOString())
    .map((r) => ({
      kind: r.kind,
      ref: r.ref,
      title: r.title,
      eventDate: r.event_date,
    }));
}

function buildUserPrompt(
  summary: string,
  findings: ContextFinding[],
  activity: OwnActivity[],
): string {
  const peers = findings.filter((f) => f.source === "github_similar");
  const discussion = findings.filter((f) => f.source !== "github_similar");

  const peerBlock = peers.length
    ? peers
        .map((f) => {
          const parts = [
            `#${f.id} [${f.owner ?? "?"}/${f.repoName ?? "?"}]`,
            f.description ? `— ${f.description.slice(0, 180)}` : "",
            f.stars != null ? `(${f.stars}★)` : "",
            f.language ? `[${f.language}]` : "",
            f.lastPushedAt ? `last push ${f.lastPushedAt.slice(0, 10)}` : "",
          ].filter(Boolean);
          return parts.join(" ");
        })
        .join("\n")
    : "(none found)";

  const discussionBlock = discussion.length
    ? discussion
        .slice(0, 25)
        .map((f) => {
          const suffix = f.points != null ? ` (${f.points} pts)` : "";
          const snip = f.snippet ? ` — ${f.snippet.slice(0, 140)}` : "";
          return `#${f.id} [${f.source}] ${f.title}${suffix}${snip}`;
        })
        .join("\n")
    : "(none found)";

  const activityBlock = activity.length
    ? activity
        .map(
          (a) =>
            `- ${a.kind} ${a.ref.slice(0, 10)} ${a.eventDate.slice(0, 10)}: ${a.title.slice(0, 140)}`,
        )
        .join("\n")
    : "(no recent activity captured)";

  return `PROJECT:
${summary}

OWN_ACTIVITY (last 60 days, shipped or in-progress work — don't re-suggest these):
${activityBlock}

PEER_COMPETITORS (similar GitHub repos):
${peerBlock}

DISCUSSION (last 30 days, news/forums):
${discussionBlock}

Return the insights JSON now.`;
}

function safeParseJson(raw: string): {
  market?: unknown;
  suggestions?: unknown;
} | null {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // Salvage the first {...} block in case the model wrapped it.
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function sanitizeBullets(
  raw: unknown,
  validIds: Set<number>,
): InsightBullet[] {
  if (!Array.isArray(raw)) return [];
  const out: InsightBullet[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const title = typeof rec.title === "string" ? rec.title.trim() : "";
    const rationale =
      typeof rec.rationale === "string" ? rec.rationale.trim() : "";
    const ids = Array.isArray(rec.findingIds)
      ? rec.findingIds
          .filter((n): n is number => typeof n === "number" && validIds.has(n))
      : [];
    if (!title || !rationale || ids.length === 0) continue;
    out.push({ title, rationale, findingIds: ids });
  }
  return out;
}
