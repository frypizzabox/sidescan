import type { SparklineBucket } from "@/lib/api";

/**
 * Pure-Tailwind sparkline. Each bucket = one bar. Height scales to the
 * max count in the window so a quiet project still renders visibly.
 */
export function Sparkline({
  buckets,
  height = 28,
}: {
  buckets: SparklineBucket[];
  height?: number;
}) {
  if (buckets.length === 0) return null;
  const max = buckets.reduce((m, b) => (b.count > m ? b.count : m), 0);
  const total = buckets.reduce((sum, b) => sum + b.count, 0);

  return (
    <div
      className="inline-flex items-end gap-[2px]"
      style={{ height }}
      title={`${total} finding${total === 1 ? "" : "s"} over ${buckets.length} day${buckets.length === 1 ? "" : "s"}`}
    >
      {buckets.map((b) => {
        const heightPct =
          max === 0 ? 0 : Math.max(8, Math.round((b.count / max) * 100));
        const tone = b.count === 0 ? "bg-hairline" : "bg-emerald-400";
        return (
          <span
            key={b.date}
            className={`w-[3px] rounded-sm ${tone}`}
            style={{ height: `${heightPct}%` }}
            aria-label={`${b.count} on ${b.date}`}
          />
        );
      })}
    </div>
  );
}
