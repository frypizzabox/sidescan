export type CompetitorSort = "relevance" | "stars" | "recent";

export function CompetitorControls({
  sort,
  setSort,
  lang,
  setLang,
  activeOnly,
  setActiveOnly,
  languages,
}: {
  sort: CompetitorSort;
  setSort: (s: CompetitorSort) => void;
  lang: string;
  setLang: (l: string) => void;
  activeOnly: boolean;
  setActiveOnly: (b: boolean) => void;
  languages: string[];
}) {
  const sortOptions: { k: CompetitorSort; l: string }[] = [
    { k: "relevance", l: "Relevance" },
    { k: "stars", l: "Stars" },
    { k: "recent", l: "Recent activity" },
  ];

  return (
    <div className="flex items-center gap-2 flex-wrap py-2.5 border-b border-hairline">
      <div className="flex items-center gap-1 text-[12px]">
        <span className="text-ink-3 mr-1">Sort</span>
        {sortOptions.map((o) => (
          <button
            key={o.k}
            type="button"
            onClick={() => setSort(o.k)}
            className={`px-2 py-1 rounded font-medium ring-1 ring-inset transition-colors ${
              sort === o.k
                ? "bg-ink-1 text-canvas ring-ink-1"
                : "bg-surface-raised text-ink-2 ring-hairline hover:ring-hairline-strong"
            }`}
          >
            {o.l}
          </button>
        ))}
      </div>
      <div className="ml-auto flex items-center gap-2">
        <label className="inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-2 cursor-pointer">
          <input
            type="checkbox"
            className="w-3 h-3 rounded accent-emerald-600"
            checked={activeOnly}
            onChange={(e) => setActiveOnly(e.target.checked)}
          />
          Active in last 30d
        </label>
        <select
          value={lang}
          onChange={(e) => setLang(e.target.value)}
          className="text-[12px] px-2 py-1 rounded bg-surface-raised ring-1 ring-inset ring-hairline text-ink-2 hover:ring-hairline-strong focus:outline-none focus:ring-hairline-strong"
        >
          <option value="all">All languages</option>
          {languages.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
