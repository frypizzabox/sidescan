import type { Finding } from "@/lib/api";
import type { Density, ReadStyle } from "@/lib/prefs";
import { Icon } from "@/components/ui/Icon";
import { MatchPill } from "@/components/ui/MatchPill";
import { NewBadge } from "@/components/ui/NewBadge";
import { SourceThumb } from "@/components/ui/SourceThumb";
import { SOURCE_META, TONE_CLASSES, extractDomain } from "@/components/ui/source-meta";
import { absoluteTime, relativeTime } from "@/components/ui/time";

export function FeedFinding({
  finding,
  isRead,
  onOpen,
  density,
  readStyle,
  showThumbs,
}: {
  finding: Finding;
  isRead: boolean;
  onOpen: () => void;
  density: Density;
  readStyle: ReadStyle;
  showThumbs: boolean;
}) {
  const meta = SOURCE_META[finding.source];
  const unread = !isRead;
  const pad = density === "compact" ? "py-3" : "py-4";
  const titleSize = density === "compact" ? "text-[14px]" : "text-[15px]";
  const titleWeight = unread
    ? "font-semibold text-ink-1"
    : "font-medium text-ink-3";
  const snippetColor = unread ? "text-ink-2" : "text-ink-4";

  const railClass =
    readStyle === "rail" && unread
      ? "border-l-2 border-emerald-500"
      : readStyle === "tint" && unread
        ? "bg-emerald-50/40"
        : "";

  const domain = finding.domain ?? extractDomain(finding.url);

  return (
    <a
      href={finding.url}
      target="_blank"
      rel="noreferrer noopener"
      onClick={onOpen}
      className={`group relative flex gap-3 px-4 ${pad} ${railClass} border-b border-hairline last:border-b-0 hover:bg-surface/70 transition-colors cursor-pointer`}
    >
      {readStyle === "dot" && (
        <span
          className={`absolute left-1.5 top-[22px] w-1.5 h-1.5 rounded-full ${unread ? "bg-emerald-500" : "bg-transparent"}`}
        />
      )}
      {showThumbs && (
        <SourceThumb
          item={finding}
          size={density === "compact" ? 44 : 52}
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2 flex-wrap">
          <h3
            className={`${titleSize} ${titleWeight} leading-[20px] tracking-[-0.005em] min-w-0 flex-1`}
          >
            {finding.title}
            <Icon.Ext className="inline-block w-3 h-3 ml-1 text-ink-4 group-hover:text-ink-4 align-[-1px]" />
          </h3>
          {finding.isNew && unread && <NewBadge />}
          <MatchPill
            score={finding.relevanceScore}
            similarityScore={finding.similarityScore}
            density={density}
          />
        </div>
        {finding.snippet && density !== "compact" && (
          <p
            className={`mt-1 text-[13px] leading-[18px] ${snippetColor} line-clamp-2`}
          >
            {finding.snippet}
          </p>
        )}
        <div className="mt-1.5 flex items-center gap-2 text-[12px] text-ink-3 flex-wrap">
          <span
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide uppercase ring-1 ring-inset ${TONE_CLASSES[meta.tone]}`}
          >
            {meta.short}
          </span>
          <span className="text-ink-4">·</span>
          <span className="truncate max-w-[180px]">{domain}</span>
          {finding.points != null && (
            <>
              <span className="text-ink-4">·</span>
              <span>▲ {finding.points}</span>
            </>
          )}
          {finding.comments != null && (
            <>
              <span className="text-ink-4">·</span>
              <span>{finding.comments} comments</span>
            </>
          )}
          <span className="text-ink-4">·</span>
          <time
            title={absoluteTime(finding.eventDate)}
            className="tabular-nums"
          >
            {relativeTime(finding.eventDate)}
          </time>
        </div>
      </div>
    </a>
  );
}
