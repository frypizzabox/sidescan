import { Link, useParams } from "react-router-dom";
import {
  useProject,
  useSparkline,
  type Repo,
  type ScanSummary,
} from "@/lib/api";
import { Icon } from "@/components/ui/Icon";
import { RepoAvatar } from "@/components/ui/RepoAvatar";
import { Sparkline } from "@/components/ui/Sparkline";
import { absoluteTime, relativeTime } from "@/components/ui/time";

export function ProjectTab() {
  const { slug } = useParams();
  const { data, isLoading, isError } = useProject(slug);

  if (isLoading) {
    return (
      <div className="py-12 text-center text-sm text-ink-3">Loading…</div>
    );
  }
  if (isError || !data) {
    return (
      <div className="py-12 text-center text-sm text-red-600">
        Failed to load project.
      </div>
    );
  }

  const { project, repos, scans } = data;

  return (
    <div className="space-y-6">
      <ActivityTrend slug={project.slug} />

      <Section title="Repos" count={repos.length}>
        <div className="space-y-2">
          {repos.map((r) => (
            <RepoCard key={r.id} repo={r} />
          ))}
        </div>
      </Section>

      <Section title="Recent scans" count={scans.length}>
        {scans.length === 0 ? (
          <p className="text-[13px] text-ink-3">
            No scans yet. Run{" "}
            <code className="px-1 rounded bg-surface-sunk font-mono text-[12px]">
              sidescan scan {project.slug}
            </code>
            .
          </p>
        ) : (
          <div className="space-y-0 rounded-md ring-1 ring-inset ring-hairline overflow-hidden">
            {scans.map((s) => (
              <ScanRow key={s.id} slug={project.slug} scan={s} />
            ))}
          </div>
        )}
      </Section>

      <Section title="Scan config">
        <dl className="grid grid-cols-[minmax(140px,auto)_1fr] gap-x-6 gap-y-1 text-[13px]">
          <DtDd label="Frequency" value={project.scan.frequency} />
          {project.scan.time && (
            <DtDd label="Time" value={project.scan.time} />
          )}
          <DtDd
            label="Bootstrap lookback"
            value={`${project.bootstrapLookbackYears} year${project.bootstrapLookbackYears === 1 ? "" : "s"}`}
          />
        </dl>
      </Section>
    </div>
  );
}

function ActivityTrend({ slug }: { slug: string }) {
  const { data } = useSparkline(slug, 30);
  if (!data || data.buckets.length === 0) return null;
  const total = data.buckets.reduce((sum, b) => sum + b.count, 0);

  return (
    <section className="rounded-md ring-1 ring-inset ring-hairline bg-surface-raised px-3 py-2.5 flex items-center gap-4">
      <div>
        <h2 className="text-[11px] font-bold tracking-wider uppercase text-ink-3">
          Activity trend
        </h2>
        <p className="text-[12px] text-ink-3">
          <span className="text-ink-1 font-medium tabular-nums">{total}</span>{" "}
          finding{total === 1 ? "" : "s"} over the last {data.days} days
        </p>
      </div>
      <div className="ml-auto">
        <Sparkline buckets={data.buckets} height={32} />
      </div>
    </section>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-2">
        <h2 className="text-[11px] font-bold tracking-wider uppercase text-ink-3">
          {title}
        </h2>
        {count != null && (
          <span className="text-[11px] text-ink-4 tabular-nums">· {count}</span>
        )}
      </div>
      {children}
    </section>
  );
}

function DtDd({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-ink-3">{label}</dt>
      <dd className="text-ink-1 font-medium">{value}</dd>
    </>
  );
}

function RepoCard({ repo }: { repo: Repo }) {
  const owner = repo.githubKey?.split("/")[0] ?? null;
  const name = repo.githubKey?.split("/")[1] ?? null;
  const isGithub = repo.githubKey != null;

  return (
    <div className="rounded-md ring-1 ring-inset ring-hairline bg-surface-raised p-3">
      <div className="flex items-start gap-3">
        {isGithub && owner ? (
          <RepoAvatar seed={repo.githubKey!} owner={owner} size={40} />
        ) : (
          <div className="w-10 h-10 shrink-0 rounded-md bg-surface-sunk ring-1 ring-inset ring-hairline flex items-center justify-center">
            <span className="text-[10px] font-bold tracking-wider uppercase text-ink-3">
              local
            </span>
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2 flex-wrap">
            {isGithub ? (
              <a
                href={repo.path}
                target="_blank"
                rel="noreferrer noopener"
                className="text-[15px] leading-[20px] font-semibold text-ink-1 hover:text-ink-2 tracking-[-0.005em] break-words"
              >
                <span className="text-ink-3 font-medium">{owner}/</span>
                <span>{name}</span>
                <Icon.Ext className="inline-block w-3 h-3 ml-1 text-ink-4 align-[-1px]" />
              </a>
            ) : (
              <span className="text-[15px] leading-[20px] font-semibold text-ink-1 break-all">
                {repo.path}
              </span>
            )}
            {repo.branch && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium leading-[14px] ring-1 ring-inset text-ink-2 bg-surface ring-hairline font-mono">
                {repo.branch}
              </span>
            )}
          </div>
          <div className="mt-1.5 flex items-center gap-3 text-[12px] text-ink-3 flex-wrap">
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Icon.Commit className="w-3.5 h-3.5 text-ink-4" />
              {repo.commitCount} commit{repo.commitCount === 1 ? "" : "s"} tracked
            </span>
            {repo.lastScannedAt && (
              <>
                <span className="text-ink-4">·</span>
                <span title={absoluteTime(repo.lastScannedAt)}>
                  last scanned {relativeTime(repo.lastScannedAt)}
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ScanRow({ slug, scan }: { slug: string; scan: ScanSummary }) {
  const statusClass =
    scan.status === "success"
      ? "text-emerald-700 bg-emerald-50 ring-emerald-200"
      : scan.status === "partial"
        ? "text-amber-700 bg-amber-50 ring-amber-200"
        : scan.status === "failed"
          ? "text-red-700 bg-red-50 ring-red-200"
          : "text-ink-2 bg-surface-sunk ring-hairline";

  return (
    <Link
      to={`/projects/${slug}/scans/${scan.id}`}
      className="flex items-center gap-3 px-3 py-2.5 border-b last:border-b-0 border-hairline hover:bg-surface/70"
    >
      <span
        className={`shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide uppercase ring-1 ring-inset ${statusClass}`}
      >
        {scan.status}
      </span>
      <span className="text-[13px] text-ink-1 font-medium tabular-nums">
        #{scan.id}
      </span>
      {scan.isBootstrap && (
        <span className="text-[10px] uppercase tracking-wider text-ink-4">
          bootstrap
        </span>
      )}
      <span className="text-[12px] text-ink-3 flex-1 truncate">
        {scan.newFindings} new finding{scan.newFindings === 1 ? "" : "s"}
        {scan.costEstimateUSD != null && scan.costEstimateUSD > 0 && (
          <> · ${scan.costEstimateUSD.toFixed(4)}</>
        )}
      </span>
      <time className="shrink-0 text-[11px] text-ink-4 tabular-nums">
        {relativeTime(scan.startedAt)}
      </time>
    </Link>
  );
}
