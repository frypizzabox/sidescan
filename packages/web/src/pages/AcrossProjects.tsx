import { Link } from "react-router-dom";
import { useAcross, type FindingSource } from "@/lib/api";

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

export function AcrossProjects() {
  const { data, isLoading, isError } = useAcross(7);

  if (isLoading) {
    return <div className="px-8 py-10 text-zinc-500">Loading…</div>;
  }
  if (isError) {
    return <div className="px-8 py-10 text-red-600">Failed to load feed.</div>;
  }

  const findings = data?.findings ?? [];

  return (
    <div className="max-w-4xl mx-auto px-8 py-10">
      <h1 className="text-2xl font-semibold mb-1">Across all projects</h1>
      <p className="text-sm text-zinc-500 mb-6">
        New findings from the last {data?.days ?? 7} days, sorted by relevance.
      </p>

      {findings.length === 0 && (
        <p className="text-zinc-500 text-sm">
          No new findings yet. Run <code>sidescan scan</code> on a project to
          populate.
        </p>
      )}

      <ul className="space-y-3">
        {findings.map((f) => (
          <li
            key={f.id}
            className="rounded-lg border border-zinc-200 hover:border-zinc-300 hover:shadow-sm p-3 transition"
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
                  <Link
                    to={`/projects/${f.projectSlug}`}
                    className="text-[10px] uppercase tracking-wide text-zinc-500 hover:text-zinc-800"
                  >
                    {f.projectName}
                  </Link>
                </div>
                {f.snippet && (
                  <p className="text-xs text-zinc-600 mt-1 line-clamp-3">
                    {f.snippet}
                  </p>
                )}
                <div className="text-[11px] text-zinc-500 mt-1 flex gap-2 flex-wrap">
                  {f.eventDate && <span>{formatDate(f.eventDate)}</span>}
                  {f.relevanceScore != null && (
                    <span>rel {(f.relevanceScore * 100).toFixed(0)}%</span>
                  )}
                  <span className="truncate">{extractHost(f.url)}</span>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
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
