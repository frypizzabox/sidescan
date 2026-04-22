import { Link, useParams } from "react-router-dom";
import { useScanDetail } from "@/lib/api";

export function ScanDetail() {
  const { slug, scanId } = useParams();
  const id = scanId ? parseInt(scanId, 10) : undefined;
  const { data, isLoading, isError } = useScanDetail(slug, id);

  if (isLoading) {
    return <div className="px-8 py-10 text-ink-3">Loading…</div>;
  }
  if (isError || !data) {
    return (
      <div className="px-8 py-10 text-red-600">
        Scan not found or failed to load.
      </div>
    );
  }

  const { scan, findings, activity } = data;

  return (
    <div className="max-w-4xl mx-auto px-8 py-10">
      <Link
        to={`/projects/${slug}`}
        className="text-xs text-ink-3 hover:text-ink-1"
      >
        ← {slug}
      </Link>
      <h1 className="text-2xl font-semibold mt-2 mb-1">Scan #{scan.id}</h1>
      <p className="text-xs text-ink-3 mb-6">
        {scan.status} · {formatDate(scan.startedAt)}
        {scan.aiProvider && <> · {scan.aiProvider}</>}
        {scan.isBootstrap && <> · bootstrap</>}
        {scan.costEstimateUSD != null && (
          <> · ${scan.costEstimateUSD.toFixed(4)}</>
        )}
      </p>

      {scan.errorMessage && (
        <section className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <div className="text-[11px] uppercase tracking-wide font-medium mb-1">
            Error
          </div>
          {scan.errorMessage}
        </section>
      )}

      <Section title={`Findings (${findings.length})`}>
        {findings.length === 0 ? (
          <p className="text-ink-3 text-sm">None this scan.</p>
        ) : (
          <ul className="space-y-2">
            {findings.map((f) => (
              <li
                key={f.id}
                className="rounded border border-hairline p-2 text-sm"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] uppercase tracking-wide text-ink-3">
                    {f.source}
                  </span>
                  <a
                    href={f.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="font-medium text-ink-1 hover:underline break-words"
                  >
                    {f.title}
                  </a>
                  {f.first_seen_scan_id === scan.id && (
                    <span className="text-[10px] uppercase tracking-wide text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                      new
                    </span>
                  )}
                  {f.dismissed === 1 && (
                    <span className="text-[10px] uppercase tracking-wide text-ink-4">
                      dismissed
                    </span>
                  )}
                  {f.relevance_score != null && (
                    <span className="text-[11px] text-ink-3">
                      rel {(f.relevance_score * 100).toFixed(0)}%
                    </span>
                  )}
                </div>
                {f.snippet && (
                  <p className="text-xs text-ink-2 mt-1 line-clamp-2">
                    {f.snippet}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Repo activity (${activity.length})`}>
        {activity.length === 0 ? (
          <p className="text-ink-3 text-sm">None this scan.</p>
        ) : (
          <ul className="space-y-2">
            {activity.map((a) => (
              <li
                key={a.id}
                className="rounded border border-hairline p-2 text-sm"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] uppercase tracking-wide text-ink-3">
                    {a.kind}
                  </span>
                  <code className="text-[11px] bg-surface-sunk px-1 rounded">
                    {a.ref.slice(0, 8)}
                  </code>
                  <span className="text-ink-1 break-words">{a.title}</span>
                </div>
                <div className="text-[11px] text-ink-3 mt-1">
                  {formatDate(a.event_date)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6">
      <h2 className="text-sm font-semibold text-ink-1 mb-2">{title}</h2>
      {children}
    </section>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
