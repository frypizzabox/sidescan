import { Link } from "react-router-dom";
import { useAcross, type FindingSource } from "@/lib/api";
import { relativeTime } from "@/components/ui/time";

const SOURCE_TONE: Record<FindingSource, string> = {
  hn: "text-orange-700 bg-orange-50 ring-orange-200",
  ph: "text-red-700 bg-red-50 ring-red-200",
  web: "text-sky-700 bg-sky-50 ring-sky-200",
  github_similar: "text-zinc-700 bg-zinc-100 ring-zinc-200",
};

const SOURCE_SHORT: Record<FindingSource, string> = {
  hn: "HN",
  ph: "PH",
  web: "WEB",
  github_similar: "GH",
};

export function AcrossProjects() {
  const { data, isLoading, isError } = useAcross(7);

  if (isLoading) {
    return <div className="px-8 py-10 text-zinc-500 text-sm">Loading…</div>;
  }
  if (isError) {
    return (
      <div className="px-8 py-10 text-red-600 text-sm">
        Failed to load feed.
      </div>
    );
  }

  const findings = data?.findings ?? [];

  return (
    <div className="max-w-4xl mx-auto px-8 py-10">
      <h1 className="text-[22px] font-semibold text-zinc-900 tracking-[-0.01em]">
        Across projects
      </h1>
      <p className="text-[13px] text-zinc-500 mt-0.5 mb-6">
        New findings from the last {data?.days ?? 7} days, sorted by relevance.
      </p>

      {findings.length === 0 && (
        <p className="text-zinc-500 text-sm">
          No new findings yet. Run <code>sidescan scan</code> on a project to
          populate.
        </p>
      )}

      <div className="space-y-0">
        {findings.map((f) => (
          <a
            key={`${f.projectSlug}-${f.id}`}
            href={f.url}
            target="_blank"
            rel="noreferrer noopener"
            className="flex items-center gap-3 py-2.5 border-b border-zinc-100 hover:bg-zinc-50/70"
          >
            <Link
              to={`/projects/${f.projectSlug}/feed`}
              onClick={(e) => e.stopPropagation()}
              className="shrink-0 text-[11px] font-medium text-zinc-500 bg-zinc-100 px-1.5 py-0.5 rounded max-w-[140px] truncate hover:bg-zinc-200"
            >
              {f.projectName}
            </Link>
            <span
              className={`shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide uppercase ring-1 ring-inset ${SOURCE_TONE[f.source]}`}
            >
              {SOURCE_SHORT[f.source]}
            </span>
            <span className="text-[13px] text-zinc-800 flex-1 truncate font-medium">
              {f.title}
            </span>
            <time className="shrink-0 text-[11px] text-zinc-400 tabular-nums">
              {relativeTime(f.eventDate)}
            </time>
          </a>
        ))}
      </div>
    </div>
  );
}
