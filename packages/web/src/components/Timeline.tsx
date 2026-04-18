import { useParams } from "react-router-dom";
import {
  useFindings,
  useRepoActivity,
  type Finding,
  type RepoActivity,
} from "@/lib/api";
import { FindingItem } from "@/components/FindingList";

type TimelineEntry =
  | { kind: "finding"; at: string; finding: Finding }
  | { kind: "activity"; at: string; activity: RepoActivity };

export function Timeline({ limit = 100 }: { limit?: number }) {
  const { slug } = useParams();
  const findingsQ = useFindings(slug, "news", limit);
  const activityQ = useRepoActivity(slug, limit);

  if (findingsQ.isLoading || activityQ.isLoading) {
    return <div className="text-zinc-500 text-sm">Loading timeline…</div>;
  }

  const entries: TimelineEntry[] = [];
  for (const f of findingsQ.data?.findings ?? []) {
    entries.push({
      kind: "finding",
      at: f.eventDate ?? new Date().toISOString(),
      finding: f,
    });
  }
  for (const a of activityQ.data?.activity ?? []) {
    entries.push({ kind: "activity", at: a.event_date, activity: a });
  }

  entries.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

  if (entries.length === 0) {
    return (
      <div className="text-zinc-500 text-sm">
        No activity yet. Run a scan to populate this timeline.
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {entries.map((e) =>
        e.kind === "finding" ? (
          <FindingItem key={`f-${e.finding.id}`} finding={e.finding} />
        ) : (
          <ActivityItem key={`a-${e.activity.id}`} activity={e.activity} />
        ),
      )}
    </ul>
  );
}

function ActivityItem({ activity: a }: { activity: RepoActivity }) {
  return (
    <li className="rounded-lg border border-zinc-100 bg-zinc-50/50 p-3">
      <div className="flex items-start gap-3">
        <span className="text-[10px] uppercase tracking-wide font-medium px-2 py-0.5 rounded bg-purple-100 text-purple-800">
          {a.kind}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm text-zinc-800">{a.title}</div>
          <div className="text-[11px] text-zinc-500 mt-1 flex gap-2">
            <code className="bg-zinc-100 px-1 rounded">{a.ref.slice(0, 8)}</code>
            <span>{formatDate(a.event_date)}</span>
          </div>
        </div>
      </div>
    </li>
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
