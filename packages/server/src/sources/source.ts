export type SourceName =
  | "github_similar"
  | "hn"
  | "ph"
  | "web"
  | "reddit"
  | "lobsters"
  | "devto";
export type FindingTab = "news" | "github";

export interface Finding {
  source: SourceName;
  tab: FindingTab;
  url: string;
  title: string;
  snippet: string | null;
  /** ISO-8601 string if the source reports one; null otherwise. */
  eventDate: string | null;
  /** 0..1 — how strong a match the AI / ranker thinks this is. Set later. */
  relevanceScore?: number | null;
  /** 0..1 — only for github_similar. */
  similarityScore?: number | null;

  // Optional enrichment fields. Set by specific sources; NULL otherwise.
  thumbnailUrl?: string | null;
  faviconUrl?: string | null;

  /** HN score / PH upvotes. */
  points?: number | null;
  /** HN / PH comment count. */
  comments?: number | null;

  // Competitor structured fields — github_similar populates these.
  owner?: string | null;
  repoName?: string | null;
  description?: string | null;
  stars?: number | null;
  language?: string | null;
  lastPushedAt?: string | null;
}

export interface SearchOptions {
  /** Subset of queries from the AI inference step. */
  queries: string[];
  /** ISO-8601 cutoff — skip items older than this (incremental scans). */
  since?: string | null;
  /** Max results returned per query. */
  perQueryLimit?: number;
  /** Max total findings returned, after dedup. */
  maxFindings?: number;
}

export interface Source {
  name: SourceName;
  tab: FindingTab;
  /**
   * Whether the source has everything it needs to run (keys, etc.).
   * Factory returns only ready sources; callers shouldn't need to check.
   */
  ready: boolean;
  search(opts: SearchOptions): Promise<Finding[]>;
}

/**
 * Dedupes findings by (source, url) and trims to maxFindings.
 */
export function dedupeAndCap(
  findings: Finding[],
  maxFindings: number,
): Finding[] {
  const seen = new Set<string>();
  const out: Finding[] = [];
  for (const f of findings) {
    const key = `${f.source}::${f.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
    if (out.length >= maxFindings) break;
  }
  return out;
}
