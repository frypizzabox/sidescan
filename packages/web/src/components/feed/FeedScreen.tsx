import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useFeed, useMarkRead, type FeedEntry } from "@/lib/api";
import { usePrefs } from "@/lib/prefs";
import { dayKey, dayLabel } from "@/components/ui/time";
import { DigestBanner } from "./DigestBanner";
import {
  FeedControls,
  type FeedFilterKey,
  type FeedRange,
  type FeedSort,
} from "./FeedControls";
import { FeedFinding } from "./FeedFinding";
import { FeedRepoEvent } from "./FeedRepoEvent";

const DEFAULT_FILTERS: FeedFilterKey[] = [
  "hn",
  "ph",
  "web",
  "github_similar",
  "commit",
  "release",
  "issue",
  "pr",
];

const DAY_MS = 86_400_000;

function entryKind(e: FeedEntry): FeedFilterKey {
  if (e.kind === "finding") return e.finding.source;
  return e.kind;
}

function entryScore(e: FeedEntry): number {
  if (e.kind === "finding") return e.finding.relevanceScore ?? -1;
  return -1;
}

function entryIsRead(e: FeedEntry): boolean {
  return e.kind === "finding"
    ? e.finding.readAt != null
    : e.activity.readAt != null;
}

function entryReadKey(e: FeedEntry): { kind: "finding" | "activity"; id: number } {
  return e.kind === "finding"
    ? { kind: "finding", id: e.finding.id }
    : { kind: "activity", id: e.activity.id };
}

export function FeedScreen() {
  const { slug } = useParams();
  const { data, isLoading, isError } = useFeed(slug);
  const entries = data ?? [];
  const markRead = useMarkRead();
  const [prefs] = usePrefs();

  const [filters, setFilters] = useState<FeedFilterKey[]>(DEFAULT_FILTERS);
  const [sort, setSort] = useState<FeedSort>("newest");
  const [range, setRange] = useState<FeedRange>("30d");
  const [unreadOnly, setUnreadOnly] = useState(false);

  const filtered = useMemo(() => {
    const now = Date.now();
    let xs = entries.filter((e) => filters.includes(entryKind(e)));
    if (range !== "all") {
      const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
      const cutoff = now - days * DAY_MS;
      xs = xs.filter((e) => new Date(e.eventDate).getTime() >= cutoff);
    }
    if (unreadOnly) {
      xs = xs.filter((e) => !entryIsRead(e));
    }
    xs = xs.slice().sort((a, b) => {
      if (sort === "relevance") {
        const ar = entryScore(a);
        const br = entryScore(b);
        if (ar !== br) return br - ar;
      }
      return a.eventDate < b.eventDate ? 1 : a.eventDate > b.eventDate ? -1 : 0;
    });
    return xs;
  }, [entries, filters, range, unreadOnly, sort]);

  const unreadCount = useMemo(
    () => entries.reduce((n, e) => n + (entryIsRead(e) ? 0 : 1), 0),
    [entries],
  );

  const grouped = useMemo(() => {
    if (sort !== "newest") {
      return [{ key: "all", label: "", items: filtered }];
    }
    const byDay = new Map<string, FeedEntry[]>();
    for (const e of filtered) {
      const k = dayKey(e.eventDate);
      const bucket = byDay.get(k);
      if (bucket) bucket.push(e);
      else byDay.set(k, [e]);
    }
    return Array.from(byDay.entries()).map(([k, items]) => ({
      key: k,
      label: dayLabel(items[0]?.eventDate ?? k),
      items,
    }));
  }, [filtered, sort]);

  if (isLoading) {
    return (
      <div className="text-zinc-500 text-sm py-12 text-center">
        Loading feed…
      </div>
    );
  }
  if (isError) {
    return (
      <div className="text-red-600 text-sm py-12 text-center">
        Failed to load feed.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {prefs.showDigest && <DigestBanner />}

      <FeedControls
        filters={filters}
        setFilters={setFilters}
        sort={sort}
        setSort={setSort}
        range={range}
        setRange={setRange}
        unreadOnly={unreadOnly}
        setUnreadOnly={setUnreadOnly}
        unreadCount={unreadCount}
      />

      {filtered.length === 0 ? (
        <div className="py-16 text-center text-[13px] text-zinc-400">
          {entries.length === 0
            ? "No activity yet. Run a scan to populate this feed."
            : "Nothing matches these filters."}
        </div>
      ) : (
        <div className="space-y-3">
          {grouped.map((g) => (
            <section
              key={g.key}
              className="rounded-md ring-1 ring-inset ring-zinc-200 bg-white overflow-hidden"
            >
              {g.label && sort === "newest" && (
                <header className="px-4 py-2 bg-zinc-50/60 border-b border-zinc-100 flex items-baseline gap-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                    {g.label}
                  </span>
                  <span className="text-[11px] text-zinc-400 tabular-nums">
                    · {g.items.length}
                  </span>
                </header>
              )}
              {g.items.map((e) => {
                const { kind, id } = entryReadKey(e);
                const read = entryIsRead(e);
                const onOpen = () => {
                  if (!read) markRead.mutate({ kind, id });
                };
                return e.kind === "finding" ? (
                  <FeedFinding
                    key={`f-${e.finding.id}`}
                    finding={e.finding}
                    isRead={read}
                    onOpen={onOpen}
                    density={prefs.density}
                    readStyle={prefs.readStyle}
                    showThumbs={prefs.showThumbs}
                  />
                ) : (
                  <FeedRepoEvent
                    key={`a-${e.activity.id}`}
                    activity={e.activity}
                    isRead={read}
                    onOpen={onOpen}
                    density={prefs.density}
                    readStyle={prefs.readStyle}
                  />
                );
              })}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

export function useFeedUnreadCount(slug: string | undefined): number {
  const { data } = useFeed(slug);
  if (!data) return 0;
  return data.reduce((n, e) => n + (entryIsRead(e) ? 0 : 1), 0);
}
