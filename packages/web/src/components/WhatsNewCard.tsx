import { useParams, Link } from "react-router-dom";
import { useWhatsNew } from "@/lib/api";

export function WhatsNewCard() {
  const { slug } = useParams();
  const { data, isLoading } = useWhatsNew(slug);

  if (isLoading) return null;
  if (!data || data.newCount === 0) return null;

  return (
    <section className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50/50 px-4 py-3">
      <div className="flex items-start gap-3">
        <span className="text-[11px] uppercase tracking-wide text-emerald-700 font-medium">
          What's new
        </span>
        <div className="flex-1 min-w-0 text-sm text-zinc-800 leading-relaxed">
          {data.content ? (
            <p>{data.content}</p>
          ) : (
            <p className="text-zinc-600">
              {data.newCount} new finding{data.newCount === 1 ? "" : "s"} since
              the last scan.
            </p>
          )}
          {data.scanId && (
            <p className="text-[11px] text-zinc-500 mt-1">
              <Link
                to={`/projects/${slug}/scans/${data.scanId}`}
                className="hover:underline"
              >
                scan #{data.scanId}
              </Link>
              {data.createdAt && <> · {formatDate(data.createdAt)}</>}
            </p>
          )}
        </div>
      </div>
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
