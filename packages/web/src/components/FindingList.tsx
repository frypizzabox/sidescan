import { useParams } from "react-router-dom";
import {
  useFindings,
  useDismissFinding,
  type Finding,
  type FindingSource,
  type FindingTab,
} from "@/lib/api";

const SOURCE_LABEL: Record<FindingSource, string> = {
  hn: "Hacker News",
  ph: "Product Hunt",
  web: "Web",
  github_similar: "GitHub",
};

const SOURCE_COLOR: Record<FindingSource, string> = {
  hn: "bg-orange-100 text-orange-800",
  ph: "bg-red-100 text-red-800",
  web: "bg-sky-100 text-sky-800",
  github_similar: "bg-zinc-200 text-zinc-800",
};

export function FindingList({
  tab,
  emptyHint,
}: {
  tab: FindingTab;
  emptyHint: string;
}) {
  const { slug } = useParams();
  const { data, isLoading, isError } = useFindings(slug, tab);

  if (isLoading) {
    return <div className="text-zinc-500 text-sm">Loading findings…</div>;
  }
  if (isError) {
    return <div className="text-red-600 text-sm">Failed to load findings.</div>;
  }
  const findings = data?.findings ?? [];
  if (findings.length === 0) {
    return <div className="text-zinc-500 text-sm">{emptyHint}</div>;
  }

  return (
    <ul className="space-y-3">
      {findings.map((f) => (
        <FindingItem key={f.id} finding={f} />
      ))}
    </ul>
  );
}

export function FindingItem({ finding: f }: { finding: Finding }) {
  const dismiss = useDismissFinding();

  return (
    <li
      className={`rounded-lg border transition p-3 ${
        f.isNew
          ? "border-emerald-300 bg-emerald-50/40"
          : "border-zinc-200 hover:border-zinc-300 hover:shadow-sm"
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`text-[10px] uppercase tracking-wide font-medium px-2 py-0.5 rounded ${SOURCE_COLOR[f.source]}`}
        >
          {SOURCE_LABEL[f.source]}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <a
              href={f.url}
              target="_blank"
              rel="noreferrer noopener"
              className="text-sm font-medium text-zinc-900 hover:underline break-words"
            >
              {f.title}
            </a>
            {f.isNew && (
              <span className="text-[10px] uppercase tracking-wide text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                new
              </span>
            )}
          </div>
          {f.snippet && (
            <p className="text-xs text-zinc-600 mt-1 line-clamp-3">
              {f.snippet}
            </p>
          )}
          <div className="text-[11px] text-zinc-500 mt-1 flex gap-2 flex-wrap items-center">
            {f.eventDate && <span>{formatDate(f.eventDate)}</span>}
            {f.relevanceScore != null && (
              <span>rel {(f.relevanceScore * 100).toFixed(0)}%</span>
            )}
            {f.similarityScore != null && (
              <span>sim {(f.similarityScore * 100).toFixed(0)}%</span>
            )}
            <span className="truncate">{extractHost(f.url)}</span>
            <button
              type="button"
              className="ml-auto text-zinc-400 hover:text-red-600 text-[11px]"
              onClick={() => dismiss.mutate(f.id)}
              disabled={dismiss.isPending}
              title="Hide this finding"
            >
              dismiss
            </button>
          </div>
        </div>
      </div>
    </li>
  );
}

function extractHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
