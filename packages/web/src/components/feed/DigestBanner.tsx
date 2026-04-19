import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Icon } from "@/components/ui/Icon";
import { relativeTime } from "@/components/ui/time";
import { useWhatsNew } from "@/lib/api";

export function DigestBanner() {
  const { slug } = useParams();
  const { data } = useWhatsNew(slug);
  const [open, setOpen] = useState(true);

  if (!data || data.newCount === 0) return null;

  return (
    <div className="rounded-lg ring-1 ring-inset ring-emerald-200 bg-gradient-to-br from-emerald-50/60 to-white overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-emerald-50/40 transition-colors"
      >
        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-wider uppercase text-emerald-700">
          <Icon.Sparkle className="w-3.5 h-3.5" />
          Digest
        </span>
        <span className="text-[13px] text-zinc-500">
          {data.scanId != null && (
            <>
              Scan #{data.scanId}
              {data.createdAt && <> · {relativeTime(data.createdAt)}</>}
              {" · "}
            </>
          )}
          {data.newCount} new finding{data.newCount === 1 ? "" : "s"}
        </span>
        <span className="ml-auto text-zinc-400">
          <Icon.Chevron
            className={`w-3 h-3 transition-transform ${open ? "rotate-90" : ""}`}
          />
        </span>
      </button>
      {open && data.content && (
        <div className="px-4 pb-4 pt-1">
          <p className="text-[14px] leading-[22px] text-zinc-700 text-pretty">
            {data.content}
          </p>
          {data.scanId != null && (
            <p className="mt-2 text-[11px] text-zinc-500">
              <Link
                to={`/projects/${slug}/scans/${data.scanId}`}
                className="hover:underline"
              >
                View scan details →
              </Link>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
