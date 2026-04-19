import { Link, useParams } from "react-router-dom";
import { useProject, type Repo, type ScanSummary } from "@/lib/api";
import { Icon } from "@/components/ui/Icon";
import { RepoAvatar } from "@/components/ui/RepoAvatar";
import { absoluteTime, relativeTime } from "@/components/ui/time";

export function ProjectTab() {
  const { slug } = useParams();
  const { data, isLoading, isError } = useProject(slug);

  if (isLoading) {
    return (
      <div className="py-12 text-center text-sm text-zinc-500">Loading…</div>
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
      <Section title="Repos" count={repos.length}>
        <div className="space-y-2">
          {repos.map((r) => (
            <RepoCard key={r.id} repo={r} />
          ))}
        </div>
      </Section>

      <Section title="Recent scans" count={scans.length}>
        {scans.length === 0 ? (
          <p className="text-[13px] text-zinc-500">
            No scans yet. Run{" "}
            <code className="px-1 rounded bg-zinc-100 font-mono text-[12px]">
              sidescan scan {project.slug}
            </code>
            .
          </p>
        ) : (
          <div className="space-y-0 rounded-md ring-1 ring-inset ring-zinc-200 overflow-hidden">
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
        <h2 className="text-[11px] font-bold tracking-wider uppercase text-zinc-500">
          {title}
        </h2>
        {count != null && (
          <span className="text-[11px] text-zinc-400 tabular-nums">· {count}</span>
        )}
      </div>
      {children}
    </section>
  );
}

function DtDd({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-zinc-500">{label}</dt>
      <dd className="text-zinc-800 font-medium">{value}</dd>
    </>
  );
}

function RepoCard({ repo }: { repo: Repo }) {
  const owner = repo.githubKey?.split("/")[0] ?? null;
  const name = repo.githubKey?.split("/")[1] ?? null;
  const isGithub = repo.githubKey != null;

  return (
    <div className="rounded-md ring-1 ring-inset ring-zinc-200 bg-white p-3">
      <div className="flex items-start gap-3">
        {isGithub && owner ? (
          <RepoAvatar seed={repo.githubKey!} owner={owner} size={40} />
        ) : (
          <div className="w-10 h-10 shrink-0 rounded-md bg-zinc-100 ring-1 ring-inset ring-zinc-200 flex items-center justify-center">
            <span className="text-[10px] font-bold tracking-wider uppercase text-zinc-500">
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
                className="text-[15px] leading-[20px] font-semibold text-zinc-900 hover:text-zinc-700 tracking-[-0.005em] break-words"
              >
                <span className="text-zinc-500 font-medium">{owner}/</span>
                <span>{name}</span>
                <Icon.Ext className="inline-block w-3 h-3 ml-1 text-zinc-300 align-[-1px]" />
              </a>
            ) : (
              <span className="text-[15px] leading-[20px] font-semibold text-zinc-900 break-all">
                {repo.path}
              </span>
            )}
            {repo.branch && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium leading-[14px] ring-1 ring-inset text-zinc-600 bg-zinc-50 ring-zinc-200 font-mono">
                {repo.branch}
              </span>
            )}
          </div>
          <div className="mt-1.5 flex items-center gap-3 text-[12px] text-zinc-500 flex-wrap">
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Icon.Commit className="w-3.5 h-3.5 text-zinc-400" />
              {repo.commitCount} commit{repo.commitCount === 1 ? "" : "s"} tracked
            </span>
            {repo.lastScannedAt && (
              <>
                <span className="text-zinc-400">·</span>
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
          : "text-zinc-700 bg-zinc-100 ring-zinc-200";

  return (
    <Link
      to={`/projects/${slug}/scans/${scan.id}`}
      className="flex items-center gap-3 px-3 py-2.5 border-b last:border-b-0 border-zinc-100 hover:bg-zinc-50/70"
    >
      <span
        className={`shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide uppercase ring-1 ring-inset ${statusClass}`}
      >
        {scan.status}
      </span>
      <span className="text-[13px] text-zinc-800 font-medium tabular-nums">
        #{scan.id}
      </span>
      {scan.isBootstrap && (
        <span className="text-[10px] uppercase tracking-wider text-zinc-400">
          bootstrap
        </span>
      )}
      <span className="text-[12px] text-zinc-500 flex-1 truncate">
        {scan.newFindings} new finding{scan.newFindings === 1 ? "" : "s"}
        {scan.costEstimateUSD != null && scan.costEstimateUSD > 0 && (
          <> · ${scan.costEstimateUSD.toFixed(4)}</>
        )}
      </span>
      <time className="shrink-0 text-[11px] text-zinc-400 tabular-nums">
        {relativeTime(scan.startedAt)}
      </time>
    </Link>
  );
}
