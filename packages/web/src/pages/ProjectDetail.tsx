import { Outlet, useParams } from "react-router-dom";
import { useProject } from "@/lib/api";
import { TabNav } from "@/components/TabNav";

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

  const { project, repos } = data;
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
      </p>

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
  return (
    <div className="text-zinc-500 text-sm">
      News feed coming in Phase 5 — external findings (HN, Product Hunt, web)
      and repo activity on a timeline.
    </div>
  );
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
    <div className="text-zinc-500 text-sm">
      Similar GitHub repos coming in Phase 4.
    </div>
  );
}
