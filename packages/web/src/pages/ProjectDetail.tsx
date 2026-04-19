import { NavLink, Outlet, useParams } from "react-router-dom";
import { useProject, useFindings } from "@/lib/api";
import { useFeedUnreadCount } from "@/components/feed/FeedScreen";
import { Icon } from "@/components/ui/Icon";
import { absoluteTime } from "@/components/ui/time";

export function ProjectDetail() {
  const { slug } = useParams();
  const { data, isLoading, isError } = useProject(slug);

  if (isLoading) {
    return <div className="px-8 py-10 text-zinc-500 text-sm">Loading…</div>;
  }
  if (isError || !data) {
    return (
      <div className="px-8 py-10 text-red-600 text-sm">
        Project not found or failed to load.
      </div>
    );
  }

  const { project, repos, latestScan } = data;
  const base = `/projects/${project.slug}`;

  return (
    <div className="max-w-5xl mx-auto px-8 py-10">
      <div className="mb-4">
        <h1 className="text-[22px] font-semibold text-zinc-900 tracking-[-0.01em]">
          {project.name}
        </h1>
        {project.description && (
          <p className="text-[13px] text-zinc-500 mt-0.5">
            {project.description}
          </p>
        )}
        <div className="mt-1.5 flex items-center gap-2 text-[11px] font-mono text-zinc-400 flex-wrap">
          <span>
            {project.scan.frequency}
            {project.scan.time ? ` @ ${project.scan.time}` : ""}
          </span>
          <span>·</span>
          <span>
            {repos.length} repo{repos.length === 1 ? "" : "s"}
          </span>
          <span>·</span>
          <span>{project.bootstrapLookbackYears}yr lookback</span>
          {latestScan && (
            <>
              <span>·</span>
              <span>
                last scan{" "}
                <span
                  className={
                    latestScan.status === "success"
                      ? "text-emerald-600"
                      : "text-amber-600"
                  }
                >
                  {latestScan.status}
                </span>{" "}
                ({absoluteTime(latestScan.startedAt)})
              </span>
            </>
          )}
        </div>
      </div>

      {project.aiInferredSummary && (
        <div className="mb-4 rounded-md bg-white ring-1 ring-inset ring-zinc-200 p-3">
          <div className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-wider uppercase text-zinc-400 mb-1">
            <Icon.Sparkle className="w-3 h-3" />
            AI inference
          </div>
          <p className="text-[13px] leading-[20px] text-zinc-700 text-pretty">
            {project.aiInferredSummary}
          </p>
        </div>
      )}

      <ProjectTabs base={base} slug={project.slug} />

      <div className="mt-4">
        <Outlet />
      </div>
    </div>
  );
}

function ProjectTabs({ base, slug }: { base: string; slug: string }) {
  const feedUnread = useFeedUnreadCount(slug);
  const competitorsUnread = useCompetitorsUnreadCount(slug);

  const tab = (
    to: string,
    label: string,
    count: number,
    end = false,
    v2 = false,
  ) => (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `relative inline-flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium border-b-2 transition-colors ${
          isActive
            ? "border-zinc-900 text-zinc-900"
            : "border-transparent text-zinc-500 hover:text-zinc-800"
        }`
      }
    >
      {({ isActive }) => (
        <>
          {label}
          {count > 0 && (
            <span
              className={`inline-flex items-center px-1 min-w-[18px] h-[16px] justify-center rounded text-[10px] font-semibold tabular-nums ${
                isActive
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-zinc-100 text-zinc-600"
              }`}
            >
              {count}
            </span>
          )}
          {v2 && (
            <span className="ml-0.5 text-[9px] uppercase tracking-wider text-zinc-400">
              V2
            </span>
          )}
        </>
      )}
    </NavLink>
  );

  return (
    <div className="flex items-center border-b border-zinc-200 -mx-1">
      {tab(`${base}/feed`, "Feed", feedUnread)}
      {tab(`${base}/project`, "Project", 0)}
      {tab(`${base}/competitors`, "Competitors", competitorsUnread)}
      {tab(`${base}/insights`, "Insights", 0, false, true)}
    </div>
  );
}

function useCompetitorsUnreadCount(slug: string | undefined): number {
  const { data } = useFindings(slug, "github");
  if (!data) return 0;
  return data.findings.reduce(
    (n, f) => n + (f.isNew && f.readAt == null ? 1 : 0),
    0,
  );
}

export function InsightsTab() {
  return (
    <div className="py-12 text-center">
      <div className="inline-flex items-center gap-1.5 text-[10px] font-semibold tracking-wider uppercase text-zinc-400 mb-2">
        V2 only
      </div>
      <p className="text-[14px] text-zinc-500">
        Cross-project comparisons, peer deltas.
      </p>
    </div>
  );
}
