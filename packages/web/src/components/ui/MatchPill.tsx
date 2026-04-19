import { matchTier } from "./source-meta";
import type { Density } from "@/lib/prefs";

export function MatchPill({
  score,
  similarityScore,
  density = "comfortable",
}: {
  score: number | null | undefined;
  similarityScore?: number | null;
  density?: Density;
}) {
  const tier = matchTier(score);
  if (!tier || score == null) return null;
  const pct = Math.round(score * 100);
  const tooltip =
    similarityScore != null
      ? `Relevance ${pct}% · Keyword match ${Math.round(similarityScore * 100)}%`
      : `Relevance ${pct}%`;
  const padding = density === "compact" ? "px-1.5 py-0" : "px-1.5 py-0.5";
  return (
    <span
      title={tooltip}
      className={`inline-flex items-center gap-1 ${padding} rounded text-[11px] font-semibold tabular-nums leading-[14px] ring-1 ring-inset ${tier.classes}`}
    >
      <span className={`w-1 h-1 rounded-full ${tier.dot}`} />
      {pct}
    </span>
  );
}
