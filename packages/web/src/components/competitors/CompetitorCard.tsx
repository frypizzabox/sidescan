import { Icon } from "@/components/ui/Icon";
import { MatchPill } from "@/components/ui/MatchPill";
import { NewBadge } from "@/components/ui/NewBadge";
import { RepoAvatar } from "@/components/ui/RepoAvatar";
import { absoluteTime, relativeTime } from "@/components/ui/time";
import type { Density } from "@/lib/prefs";
import { LANGUAGE_COLORS, type CompetitorView } from "./parse";

export function CompetitorCard({
  repo,
  isRead,
  onOpen,
  onDismiss,
  density,
  readStyle,
  showKeywordScore,
}: {
  repo: CompetitorView;
  isRead: boolean;
  onOpen: () => void;
  onDismiss: () => void;
  density: Density;
  readStyle: "rail" | "tint" | "dot";
  showKeywordScore: boolean;
}) {
  const pad = density === "compact" ? "p-3" : "p-4";
  const unread = !isRead && repo.isNew;
  const rail = readStyle === "rail" && unread;
  const languageColor = repo.language
    ? LANGUAGE_COLORS[repo.language] ?? "#a1a1aa"
    : "#a1a1aa";

  return (
    <div
      className={`group relative rounded-md bg-white ring-1 ring-inset ring-zinc-200 ${pad} hover:ring-zinc-300 transition-shadow`}
      style={
        rail ? { boxShadow: "inset 3px 0 0 0 var(--color-new-rail)" } : undefined
      }
    >
      <div className="flex items-start gap-3">
        <RepoAvatar
          seed={repo.avatarSeed}
          owner={repo.owner}
          size={density === "compact" ? 32 : 40}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2 flex-wrap">
            <a
              href={repo.url}
              target="_blank"
              rel="noreferrer noopener"
              onClick={onOpen}
              className="min-w-0 flex-1 text-[15px] leading-[20px] font-semibold text-zinc-900 hover:text-zinc-700 tracking-[-0.005em] break-words"
            >
              <span className="text-zinc-500 font-medium">{repo.owner}/</span>
              <span>{repo.name}</span>
              <Icon.Ext className="inline-block w-3 h-3 ml-1 text-zinc-300 align-[-1px]" />
            </a>
            {repo.isNew && unread && <NewBadge />}
            <div className="flex items-center gap-1 shrink-0">
              <MatchPill
                score={repo.relevanceScore}
                similarityScore={repo.similarityScore}
                density={density}
              />
              {showKeywordScore && repo.similarityScore != null && (
                <span
                  title={`Keyword match ${Math.round(repo.similarityScore * 100)}%`}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium leading-[14px] ring-1 ring-inset text-zinc-600 bg-zinc-50 ring-zinc-200 tabular-nums"
                >
                  <span className="w-1 h-1 rounded-full bg-zinc-400" />
                  kw {Math.round(repo.similarityScore * 100)}
                </span>
              )}
            </div>
          </div>
          {repo.description && (
            <p className="mt-1 text-[13px] leading-[18px] text-zinc-600 line-clamp-2">
              {repo.description}
            </p>
          )}
          <div className="mt-2 flex items-center gap-3 text-[12px] text-zinc-500 flex-wrap">
            {repo.stars != null && (
              <span className="inline-flex items-center gap-1 tabular-nums">
                <Icon.Star className="w-3 h-3 text-zinc-400" />
                {repo.stars.toLocaleString()}
              </span>
            )}
            {repo.language && (
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ background: languageColor }}
                />
                {repo.language}
              </span>
            )}
            {repo.lastPushedAt && (
              <>
                {(repo.stars != null || repo.language) && (
                  <span className="text-zinc-400">·</span>
                )}
                <span title={absoluteTime(repo.lastPushedAt)}>
                  pushed {relativeTime(repo.lastPushedAt)}
                </span>
              </>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          title="Dismiss"
          className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 w-6 h-6 -mr-1 -mt-1 rounded flex items-center justify-center text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100"
        >
          <Icon.Dismiss className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
