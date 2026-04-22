import { useParams } from "react-router-dom";
import {
  useInsights,
  type InsightBullet,
  type InsightsFindingRef,
  type InsightsResponse,
} from "@/lib/api";
import { relativeTime } from "@/components/ui/time";
import {
  SOURCE_META,
  TONE_CLASSES,
  type FeedKind,
} from "@/components/ui/source-meta";

export function InsightsTab() {
  const { slug } = useParams();
  const { data, isLoading, isError } = useInsights(slug);

  if (isLoading) {
    return (
      <div className="py-12 text-center text-[13px] text-ink-3">
        Loading insights…
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="py-12 text-center text-[13px] text-red-600 dark:text-red-400">
        Failed to load insights.
      </div>
    );
  }

  const hasContent = data.market.length > 0 || data.suggestions.length > 0;
  if (!hasContent) {
    return <EmptyState scanId={data.scanId} />;
  }

  return (
    <div className="space-y-6">
      <header className="flex items-baseline gap-2">
        <h1 className="text-[18px] leading-[26px] font-semibold tracking-[-0.01em] text-ink-1">
          Insights
        </h1>
        {data.generatedAt && (
          <span className="text-[12px] text-ink-4">
            · generated {relativeTime(data.generatedAt)}
            {data.scanId != null && ` from scan #${data.scanId}`}
          </span>
        )}
      </header>

      {data.suggestions.length > 0 && (
        <Panel
          title="Suggestions for you"
          description="Concrete next steps based on peer activity and your recent commits."
          bullets={data.suggestions}
          findings={data.findings}
          accent="emerald"
        />
      )}

      {data.market.length > 0 && (
        <Panel
          title="What the market built"
          description="Recent peer shipments and discussion in your project's space."
          bullets={data.market}
          findings={data.findings}
          accent="zinc"
        />
      )}
    </div>
  );
}

function EmptyState({ scanId }: { scanId: number | null }) {
  return (
    <div className="py-12 text-center">
      <p className="text-[14px] text-ink-2">
        {scanId == null
          ? "No scans yet — run a scan and insights will appear here."
          : "Not enough peer or discussion data from the latest scan to generate insights."}
      </p>
      <p className="mt-2 text-[12px] text-ink-4">
        Insights regenerate automatically on every scan.
      </p>
    </div>
  );
}

function Panel({
  title,
  description,
  bullets,
  findings,
  accent,
}: {
  title: string;
  description: string;
  bullets: InsightBullet[];
  findings: InsightsResponse["findings"];
  accent: "emerald" | "zinc";
}) {
  const headerTone =
    accent === "emerald"
      ? "text-emerald-700 dark:text-emerald-300"
      : "text-ink-3";

  return (
    <section className="rounded-md ring-1 ring-inset ring-hairline bg-surface-raised overflow-hidden">
      <header className="px-4 py-3 border-b border-hairline">
        <h2
          className={`text-[11px] font-bold tracking-wider uppercase ${headerTone}`}
        >
          {title}
        </h2>
        <p className="text-[12px] text-ink-3 mt-0.5">{description}</p>
      </header>
      <ul className="divide-y divide-hairline">
        {bullets.map((b, i) => (
          <Bullet key={`${i}-${b.title}`} bullet={b} findings={findings} />
        ))}
      </ul>
    </section>
  );
}

function Bullet({
  bullet,
  findings,
}: {
  bullet: InsightBullet;
  findings: InsightsResponse["findings"];
}) {
  const refs = bullet.findingIds
    .map((id) => findings[id])
    .filter((f): f is InsightsFindingRef => !!f);

  return (
    <li className="px-4 py-3 space-y-2">
      <h3 className="text-[14px] font-semibold text-ink-1 leading-[20px] tracking-[-0.005em]">
        {bullet.title}
      </h3>
      <p className="text-[13px] text-ink-2 leading-[19px] text-pretty">
        {bullet.rationale}
      </p>
      {refs.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {refs.map((ref) => (
            <SourceChip key={ref.id} ref={ref} />
          ))}
        </div>
      )}
    </li>
  );
}

function SourceChip({ ref }: { ref: InsightsFindingRef }) {
  const meta = SOURCE_META[ref.source as FeedKind];
  const tone = meta ? TONE_CLASSES[meta.tone] : TONE_CLASSES.zinc;
  const shortTitle =
    ref.source === "github_similar" && ref.owner && ref.repoName
      ? `${ref.owner}/${ref.repoName}`
      : ref.title;

  return (
    <a
      href={ref.url}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex items-center gap-1.5 max-w-[280px] px-2 py-1 rounded ring-1 ring-inset ring-hairline bg-surface hover:bg-surface-sunk transition-colors"
    >
      <span
        className={`inline-flex items-center px-1 rounded text-[10px] font-semibold tracking-wide uppercase ring-1 ring-inset ${tone}`}
      >
        {meta?.short ?? ref.source}
      </span>
      <span className="text-[12px] text-ink-2 truncate">{shortTitle}</span>
      {ref.points != null && (
        <span className="shrink-0 text-[11px] text-ink-4 tabular-nums">
          {ref.points}
        </span>
      )}
    </a>
  );
}
