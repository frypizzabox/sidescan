import { Dropdown } from "@/components/ui/Dropdown";

export type FeedSort = "newest" | "relevance";
export type FeedRange = "7d" | "30d" | "90d" | "all";
export type FeedFilterKey =
  | "hn"
  | "ph"
  | "web"
  | "github_similar"
  | "commit"
  | "release"
  | "issue"
  | "pr";

const SOURCE_FILTERS: {
  key: FeedFilterKey;
  label: string;
  dot: string;
  active: string;
}[] = [
  {
    key: "hn",
    label: "Hacker News",
    dot: "bg-orange-500",
    active: "bg-orange-50 text-orange-800 ring-orange-200",
  },
  {
    key: "ph",
    label: "Product Hunt",
    dot: "bg-red-500",
    active: "bg-red-50 text-red-800 ring-red-200",
  },
  {
    key: "web",
    label: "Web",
    dot: "bg-sky-500",
    active: "bg-sky-50 text-sky-800 ring-sky-200",
  },
  {
    key: "commit",
    label: "Commits",
    dot: "bg-purple-500",
    active: "bg-purple-50 text-purple-800 ring-purple-200",
  },
  {
    key: "release",
    label: "Releases",
    dot: "bg-violet-500",
    active: "bg-violet-50 text-violet-800 ring-violet-200",
  },
];

export function FeedControls({
  filters,
  setFilters,
  sort,
  setSort,
  range,
  setRange,
  unreadOnly,
  setUnreadOnly,
  unreadCount,
}: {
  filters: FeedFilterKey[];
  setFilters: (fn: (prev: FeedFilterKey[]) => FeedFilterKey[]) => void;
  sort: FeedSort;
  setSort: (s: FeedSort) => void;
  range: FeedRange;
  setRange: (r: FeedRange) => void;
  unreadOnly: boolean;
  setUnreadOnly: (b: boolean) => void;
  unreadCount: number;
}) {
  const toggle = (key: FeedFilterKey) => {
    setFilters((f) =>
      f.includes(key) ? f.filter((k) => k !== key) : [...f, key],
    );
  };

  return (
    <div className="flex items-center gap-2 flex-wrap py-2.5 border-b border-hairline">
      <div className="flex items-center gap-1 flex-wrap">
        {SOURCE_FILTERS.map((s) => {
          const active = filters.includes(s.key);
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => toggle(s.key)}
              className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-[12px] font-medium ring-1 ring-inset transition-colors ${
                active
                  ? s.active
                  : "text-ink-3 bg-surface-raised ring-hairline hover:text-ink-1 hover:ring-hairline-strong"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
              {s.label}
            </button>
          );
        })}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <label className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-[12px] font-medium text-ink-2 hover:text-ink-1 cursor-pointer">
          <input
            type="checkbox"
            className="w-3 h-3 rounded border-hairline-strong accent-emerald-600"
            checked={unreadOnly}
            onChange={(e) => setUnreadOnly(e.target.checked)}
          />
          Unread only
          {unreadCount > 0 && (
            <span className="inline-flex items-center px-1 min-w-[18px] h-[16px] justify-center rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800">
              {unreadCount}
            </span>
          )}
        </label>
        <Dropdown
          label={sort === "newest" ? "Newest" : "Most relevant"}
          value={sort}
          options={[
            { value: "newest", label: "Newest first" },
            { value: "relevance", label: "Most relevant" },
          ]}
          onChange={setSort}
        />
        <Dropdown
          label={range === "all" ? "All time" : range}
          value={range}
          options={[
            { value: "7d", label: "Last 7 days" },
            { value: "30d", label: "Last 30 days" },
            { value: "90d", label: "Last 90 days" },
            { value: "all", label: "All time" },
          ]}
          onChange={setRange}
        />
      </div>
    </div>
  );
}
