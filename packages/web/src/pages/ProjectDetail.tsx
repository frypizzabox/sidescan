import { Outlet, useParams } from "react-router-dom";
import { useProject } from "@/lib/api";
import { TabNav } from "@/components/TabNav";
import { FindingList } from "@/components/FindingList";
import { Timeline } from "@/components/Timeline";
import { WhatsNewCard } from "@/components/WhatsNewCard";

export function ProjectDetail() {
  const { slug } = useParams();
  const { data, isLoading, isError } = useProject(slug);

  if (isLoading) {
    return <div className="px-8 py-10 text-zinc-500">Loading…</div>;
  }
  if (isError || !data) {
    return (
      <div className="px-8 py-10 text-red-600">
        Project not found or failed to load.
      </div>
    );
  }

  const { project, repos, latestScan } = data;
  const base = `/projects/${project.slug}`;

  return (
    <div className="max-w-5xl mx-auto px-8 py-10">
      <h1 className="text-2xl font-semibold mb-1">{project.name}</h1>
      {project.description && (
        <p className="text-sm text-zinc-600 mb-1">{project.description}</p>
      )}
      <p className="text-xs text-zinc-500 mb-6">
        {project.scan.frequency}
        {project.scan.time ? ` @ ${project.scan.time}` : ""} ·{" "}
        {repos.length} repo{repos.length === 1 ? "" : "s"} ·{" "}
        {project.bootstrapLookbackYears}yr lookback
        {latestScan && (
          <>
            {" · "}
            last scan{" "}
            <span className={latestScan.status === "success" ? "" : "text-amber-700"}>
              {latestScan.status}
            </span>
            {" "}({formatDate(latestScan.startedAt)})
          </>
        )}
      </p>

      <WhatsNewCard />

      {project.aiInferredSummary ? (
        <section className="mb-6 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3">
          <div className="text-[11px] uppercase tracking-wide text-zinc-500 mb-1">
            AI inference
          </div>
          <p className="text-sm text-zinc-800 leading-relaxed">
            {project.aiInferredSummary}
          </p>
        </section>
      ) : (
        <section className="mb-6 rounded-lg border border-dashed border-zinc-200 px-4 py-3 text-sm text-zinc-500">
          No AI inference yet. Run{" "}
          <code className="text-zinc-700">sidescan scan {project.slug}</code>{" "}
          to generate one.
        </section>
      )}

      <TabNav
        tabs={[
          { label: "News", to: base, end: true },
          { label: "Insights", to: `${base}/insights` },
          { label: "Github", to: `${base}/github` },
        ]}
      />

      <div className="py-6">
        <Outlet />
      </div>
    </div>
  );
}

export function NewsTab() {
  return <Timeline />;
}

export function InsightsTab() {
  return (
    <div className="text-zinc-500 text-sm">
      Insights tab is <strong className="text-zinc-700">V2 only</strong>.
      Cross-project comparisons, peer deltas.
    </div>
  );
}

export function GithubTab() {
  return (
    <FindingList
      tab="github"
      emptyHint="No similar GitHub repos surfaced yet. Run `sidescan scan <slug>` to populate."
    />
  );
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
