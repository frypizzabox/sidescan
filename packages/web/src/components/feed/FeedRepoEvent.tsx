import type { RepoActivity } from "@/lib/api";
import type { Density, ReadStyle } from "@/lib/prefs";
import { Icon } from "@/components/ui/Icon";
import { NewBadge } from "@/components/ui/NewBadge";
import { relativeTime } from "@/components/ui/time";

export function FeedRepoEvent({
  activity,
  isRead,
  onOpen,
  density,
  readStyle,
}: {
  activity: RepoActivity;
  isRead: boolean;
  onOpen: () => void;
  density: Density;
  readStyle: ReadStyle;
}) {
  const unread = !isRead;
  const icon =
    activity.kind === "commit" ? (
      <Icon.Commit className="w-3.5 h-3.5" />
    ) : activity.kind === "release" ? (
      <Icon.Release className="w-3.5 h-3.5" />
    ) : activity.kind === "issue" ? (
      <Icon.Issue className="w-3.5 h-3.5" />
    ) : (
      <Icon.Pr className="w-3.5 h-3.5" />
    );
  const tone =
    activity.kind === "release"
      ? "text-violet-700 bg-violet-50 ring-violet-200"
      : "text-purple-700 bg-purple-50 ring-purple-200";

  const pad = density === "compact" ? "py-2" : "py-2.5";
  const railClass =
    readStyle === "rail" && unread
      ? "border-l-2 border-emerald-500"
      : readStyle === "tint" && unread
        ? "bg-emerald-50/40"
        : "";

  const href = activity.url ?? "#";

  return (
    <a
      href={href}
      target={activity.url ? "_blank" : undefined}
      rel="noreferrer noopener"
      onClick={(e) => {
        if (!activity.url) e.preventDefault();
        onOpen();
      }}
      className={`group relative flex items-center gap-3 px-4 ${pad} ${railClass} border-b border-hairline last:border-b-0 hover:bg-surface/70 ${activity.url ? "cursor-pointer" : "cursor-default"}`}
    >
      {readStyle === "dot" && (
        <span
          className={`absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full ${unread ? "bg-emerald-500" : "bg-transparent"}`}
        />
      )}
      <span
        className={`shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide uppercase ring-1 ring-inset ${tone}`}
      >
        {icon}
        {activity.kind}
      </span>
      <code className="shrink-0 text-[11px] font-mono text-ink-4 tabular-nums">
        {activity.ref.slice(0, 8)}
      </code>
      <span
        className={`flex-1 min-w-0 truncate text-[13px] leading-[18px] ${unread ? "text-ink-1 font-medium" : "text-ink-4"}`}
      >
        {activity.title}
      </span>
      {activity.isNew && unread && <NewBadge />}
      <time className="shrink-0 text-[12px] text-ink-4 tabular-nums">
        {relativeTime(activity.event_date)}
      </time>
    </a>
  );
}
