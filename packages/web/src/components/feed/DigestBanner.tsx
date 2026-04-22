import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Icon } from "@/components/ui/Icon";
import { relativeTime } from "@/components/ui/time";
import {
  SOURCE_META,
  TONE_CLASSES,
  type FeedKind,
} from "@/components/ui/source-meta";
import { useWhatsNew, type FindingSource, type DigestHighlight } from "@/lib/api";

export function DigestBanner() {
  const { slug } = useParams();
  const { data } = useWhatsNew(slug);
  const [open, setOpen] = useState(true);

  if (!data || data.newCount === 0) return null;

  const activityItems = activityEntries(data.activityCounts);
  const sourceEntries = (
    Object.entries(data.counts) as [FindingSource, number][]
  )
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);

  return (
    <div className="rounded-lg ring-1 ring-inset ring-emerald-200 bg-gradient-to-br from-emerald-50/60 to-surface-raised dark:ring-emerald-500/30 dark:from-emerald-500/10 dark:to-surface-raised overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-emerald-50/40 dark:hover:bg-emerald-500/5 transition-colors"
      >
        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-wider uppercase text-emerald-700 dark:text-emerald-300">
          <Icon.Sparkle className="w-3.5 h-3.5" />
          Digest
        </span>
        <span className="text-[13px] text-ink-3">
          {data.scanId != null && (
            <>
              Scan #{data.scanId}
              {data.createdAt && <> · {relativeTime(data.createdAt)}</>}
              {" · "}
            </>
          )}
          {data.newCount} new finding{data.newCount === 1 ? "" : "s"}
        </span>
        <span className="ml-auto text-ink-4">
          <Icon.Chevron
            className={`w-3 h-3 transition-transform ${open ? "rotate-90" : ""}`}
          />
        </span>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 space-y-3">
          {sourceEntries.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {sourceEntries.map(([source, count]) => (
                <SourcePill key={source} source={source} count={count} />
              ))}
            </div>
          )}

          {data.content && (
            <p className="text-[14px] leading-[22px] text-ink-2 text-pretty">
              {data.content}
            </p>
          )}

          {data.highlights.length > 0 && (
            <div className="flex flex-wrap items-stretch gap-1.5">
              {data.highlights.map((h) => (
                <HighlightChip key={h.findingId} highlight={h} />
              ))}
            </div>
          )}

          {activityItems.length > 0 && (
            <p className="text-[12px] text-ink-3">
              Also this scan:{" "}
              {activityItems.map((txt, i) => (
                <span key={txt}>
                  {i > 0 && ", "}
                  <span className="text-ink-2 font-medium">{txt}</span>
                </span>
              ))}
            </p>
          )}

          {data.scanId != null && (
            <p className="text-[11px] text-ink-3">
              <Link
                to={`/projects/${slug}/scans/${data.scanId}`}
                className="hover:underline"
              >
                View scan details →
              </Link>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function SourcePill({
  source,
  count,
}: {
  source: FindingSource;
  count: number;
}) {
  const meta = SOURCE_META[source as FeedKind];
  const tone = meta ? TONE_CLASSES[meta.tone] : TONE_CLASSES.zinc;
  const label = meta?.short ?? source;
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium leading-[14px] ring-1 ring-inset ${tone}`}
    >
      <span>{label}</span>
      <span className="tabular-nums text-[10px] opacity-80">· {count}</span>
    </span>
  );
}

function HighlightChip({ highlight }: { highlight: DigestHighlight }) {
  return (
    <a
      href={highlight.url}
      target="_blank"
      rel="noreferrer noopener"
      className="group max-w-[280px] rounded-md ring-1 ring-inset ring-hairline bg-surface-raised hover:ring-emerald-300 hover:bg-emerald-50/30 dark:hover:ring-emerald-500/40 dark:hover:bg-emerald-500/5 px-2 py-1.5 transition-colors"
    >
      <div className="text-[10px] font-semibold tracking-wider uppercase text-emerald-700 dark:text-emerald-300">
        {highlight.label}
      </div>
      <div className="text-[12px] leading-[16px] text-ink-1 line-clamp-2 group-hover:text-ink-1">
        {highlight.title}
      </div>
    </a>
  );
}

function activityEntries(counts: {
  commit: number;
  release: number;
  issue: number;
  pr: number;
}): string[] {
  const out: string[] = [];
  if (counts.commit > 0)
    out.push(`${counts.commit} commit${counts.commit === 1 ? "" : "s"}`);
  if (counts.release > 0)
    out.push(`${counts.release} release${counts.release === 1 ? "" : "s"}`);
  if (counts.issue > 0)
    out.push(`${counts.issue} issue${counts.issue === 1 ? "" : "s"}`);
  if (counts.pr > 0)
    out.push(`${counts.pr} PR${counts.pr === 1 ? "" : "s"}`);
  return out;
}
