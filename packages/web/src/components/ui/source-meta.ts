import type { FindingSource } from "@/lib/api";

export type FeedKind = FindingSource | "commit" | "release" | "issue" | "pr";

export interface SourceMeta {
  label: string;
  short: string;
  tone: Tone;
}

export type Tone = "orange" | "red" | "sky" | "zinc" | "purple" | "violet";

export const SOURCE_META: Record<FeedKind, SourceMeta> = {
  hn: { label: "Hacker News", short: "HN", tone: "orange" },
  ph: { label: "Product Hunt", short: "PH", tone: "red" },
  web: { label: "Web", short: "Web", tone: "sky" },
  github_similar: { label: "GitHub", short: "GH", tone: "zinc" },
  reddit: { label: "Reddit", short: "Reddit", tone: "red" },
  lobsters: { label: "Lobsters", short: "Lob", tone: "violet" },
  devto: { label: "Dev.to", short: "Dev", tone: "sky" },
  commit: { label: "Commit", short: "Commit", tone: "purple" },
  release: { label: "Release", short: "Release", tone: "violet" },
  issue: { label: "Issue", short: "Issue", tone: "purple" },
  pr: { label: "Pull request", short: "PR", tone: "purple" },
};

export const TONE_CLASSES: Record<Tone, string> = {
  orange: "text-orange-800 bg-orange-50 ring-orange-200",
  red: "text-red-800 bg-red-50 ring-red-200",
  sky: "text-sky-800 bg-sky-50 ring-sky-200",
  zinc: "text-zinc-700 bg-zinc-100 ring-zinc-200",
  purple: "text-purple-800 bg-purple-50 ring-purple-200",
  violet: "text-violet-800 bg-violet-50 ring-violet-200",
};

export const TONE_DOT: Record<Tone, string> = {
  orange: "bg-orange-500",
  red: "bg-red-500",
  sky: "bg-sky-500",
  zinc: "bg-zinc-500",
  purple: "bg-purple-500",
  violet: "bg-violet-500",
};

export type MatchTier = {
  name: "high" | "mid" | "low";
  classes: string;
  dot: string;
};

export function matchTier(score: number | null | undefined): MatchTier | null {
  if (score == null) return null;
  if (score >= 0.7)
    return {
      name: "high",
      classes: "text-emerald-700 bg-emerald-50 ring-emerald-200",
      dot: "bg-emerald-500",
    };
  if (score >= 0.4)
    return {
      name: "mid",
      classes: "text-amber-800 bg-amber-50 ring-amber-200",
      dot: "bg-amber-500",
    };
  return {
    name: "low",
    classes: "text-zinc-600 bg-zinc-100 ring-zinc-200",
    dot: "bg-zinc-400",
  };
}

export function extractDomain(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}
