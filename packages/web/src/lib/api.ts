import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

export interface Project {
  slug: string;
  name: string;
  description: string | null;
  aiInferredSummary: string | null;
  scan: {
    frequency: "daily" | "weekly" | "hourly" | "manual";
    time: string | null;
  };
  bootstrapLookbackYears: number;
  lastScanId: number | null;
  newFindingsSinceLastScan: number;
}

export interface Repo {
  id: number;
  path: string;
  branch: string | null;
  lastScannedAt: string | null;
  commitCount: number;
  githubKey: string | null;
}

export interface ScanSummary {
  id: number;
  startedAt: string;
  finishedAt: string | null;
  status: "running" | "success" | "partial" | "failed";
  costEstimateUSD: number | null;
  isBootstrap: boolean;
  newFindings: number;
}

export interface ProjectDetail {
  project: Project;
  repos: Repo[];
  latestScan: ScanSummary | null;
  scans: ScanSummary[];
}

export type FindingSource =
  | "github_similar"
  | "hn"
  | "ph"
  | "web"
  | "reddit"
  | "lobsters"
  | "devto";
export type FindingTab = "news" | "github";

export interface Finding {
  id: number;
  source: FindingSource;
  tab: FindingTab;
  url: string;
  title: string;
  snippet: string | null;
  eventDate: string | null;
  firstSeenScanId: number;
  lastSeenScanId: number;
  similarityScore: number | null;
  relevanceScore: number | null;
  isNew: boolean;
  readAt: string | null;
  thumbnailUrl: string | null;
  faviconUrl: string | null;
  points: number | null;
  comments: number | null;
  domain?: string | null;
  // Competitor structured fields — github_similar only; null otherwise.
  owner: string | null;
  repoName: string | null;
  description: string | null;
  stars: number | null;
  language: string | null;
  lastPushedAt: string | null;
}

export interface RepoActivity {
  id: number;
  kind: "commit" | "release" | "issue" | "pr";
  ref: string;
  title: string;
  event_date: string;
  url: string | null;
  repo_id?: number;
  isNew?: boolean;
  readAt?: string | null;
}

export type FeedEntry =
  | {
      kind: "finding";
      id: number;
      eventDate: string;
      finding: Finding;
    }
  | {
      kind: "commit" | "release" | "issue" | "pr";
      id: number;
      eventDate: string;
      activity: RepoActivity;
    };

export type ReadKind = "finding" | "activity";

export interface DigestHighlight {
  findingId: number;
  label: string;
  source: FindingSource;
  title: string;
  url: string;
}

export interface WhatsNewResponse {
  content: string | null;
  createdAt: string | null;
  scanId: number | null;
  newCount: number;
  counts: Partial<Record<FindingSource, number>>;
  activityCounts: { commit: number; release: number; issue: number; pr: number };
  highlights: DigestHighlight[];
}

export interface SparklineBucket {
  date: string; // YYYY-MM-DD
  count: number;
}

export interface SparklineResponse {
  days: number;
  buckets: SparklineBucket[];
}

export interface AcrossFinding {
  id: number;
  source: FindingSource;
  url: string;
  title: string;
  snippet: string | null;
  eventDate: string | null;
  relevanceScore: number | null;
  projectSlug: string;
  projectName: string;
}

export interface ScanDetail {
  scan: {
    id: number;
    startedAt: string;
    finishedAt: string | null;
    status: string;
    aiProvider: string | null;
    costEstimateUSD: number | null;
    isBootstrap: boolean;
    errorMessage: string | null;
  };
  findings: {
    id: number;
    source: FindingSource;
    tab: FindingTab;
    url: string;
    title: string;
    snippet: string | null;
    event_date: string | null;
    first_seen_scan_id: number;
    relevance_score: number | null;
    dismissed: number;
  }[];
  activity: {
    id: number;
    kind: string;
    ref: string;
    title: string;
    event_date: string;
  }[];
}

async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `API ${path} → ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`,
    );
  }
  return res.json() as Promise<T>;
}

export function useProjects() {
  return useQuery({
    queryKey: ["projects"],
    queryFn: () => request<{ projects: Project[] }>("/api/projects"),
  });
}

export function useProject(slug: string | undefined) {
  return useQuery({
    queryKey: ["project", slug],
    enabled: !!slug,
    queryFn: () => request<ProjectDetail>(`/api/projects/${slug}`),
  });
}

export function useFindings(
  slug: string | undefined,
  tab: FindingTab,
  limit = 100,
) {
  return useQuery({
    queryKey: ["findings", slug, tab, limit],
    enabled: !!slug,
    queryFn: () =>
      request<{ findings: Finding[] }>(
        `/api/projects/${slug}/findings?tab=${tab}&limit=${limit}`,
      ),
  });
}

export function useRepoActivity(slug: string | undefined, limit = 100) {
  return useQuery({
    queryKey: ["repo-activity", slug, limit],
    enabled: !!slug,
    queryFn: () =>
      request<{ activity: RepoActivity[] }>(
        `/api/projects/${slug}/repo-activity?limit=${limit}`,
      ),
  });
}

export function useWhatsNew(slug: string | undefined) {
  return useQuery({
    queryKey: ["whats-new", slug],
    enabled: !!slug,
    queryFn: () =>
      request<WhatsNewResponse>(`/api/projects/${slug}/whats-new`),
  });
}

export function useSparkline(slug: string | undefined, days = 30) {
  return useQuery({
    queryKey: ["sparkline", slug, days],
    enabled: !!slug,
    queryFn: () =>
      request<SparklineResponse>(`/api/projects/${slug}/sparkline?days=${days}`),
  });
}

export interface InsightBullet {
  title: string;
  rationale: string;
  findingIds: number[];
}

export interface InsightsFindingRef {
  id: number;
  source: FindingSource;
  title: string;
  url: string;
  owner: string | null;
  repoName: string | null;
  points: number | null;
}

export interface InsightsResponse {
  scanId: number | null;
  generatedAt: string | null;
  market: InsightBullet[];
  suggestions: InsightBullet[];
  findings: Record<number, InsightsFindingRef>;
}

export function useInsights(slug: string | undefined) {
  return useQuery({
    queryKey: ["insights", slug],
    enabled: !!slug,
    queryFn: () =>
      request<InsightsResponse>(`/api/projects/${slug}/insights`),
  });
}

export function useAcross(days = 7) {
  return useQuery({
    queryKey: ["across", days],
    queryFn: () =>
      request<{ days: number; findings: AcrossFinding[] }>(
        `/api/across?days=${days}`,
      ),
  });
}

export function useScanDetail(slug: string | undefined, scanId: number | undefined) {
  return useQuery({
    queryKey: ["scan", slug, scanId],
    enabled: !!slug && scanId != null,
    queryFn: () =>
      request<ScanDetail>(`/api/projects/${slug}/scans/${scanId}`),
  });
}

export function useFeed(slug: string | undefined, limit = 200) {
  return useQuery({
    queryKey: ["feed", slug, limit],
    enabled: !!slug,
    queryFn: async () => {
      const { entries } = await request<{ entries: FeedEntry[] }>(
        `/api/projects/${slug}/feed?limit=${limit}`,
      );
      return entries;
    },
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      kind,
      id,
      unread,
    }: {
      kind: ReadKind;
      id: number;
      unread?: boolean;
    }) => {
      const path = kind === "finding" ? "findings" : "activity";
      const action = unread ? "unread" : "read";
      return request<{ ok: boolean }>(`/api/${path}/${id}/${action}`, {
        method: "POST",
      });
    },
    onMutate: async ({ kind, id, unread }) => {
      const nowISO = unread ? null : new Date().toISOString();
      // Optimistic: patch every cached feed/findings/activity response in place.
      qc.setQueriesData<{ entries: FeedEntry[] } | FeedEntry[] | undefined>(
        { queryKey: ["feed"] },
        (prev) => {
          if (!prev) return prev;
          const entries = Array.isArray(prev) ? prev : prev.entries;
          const next = entries.map((e) => {
            if (kind === "finding" && e.kind === "finding" && e.finding.id === id) {
              return { ...e, finding: { ...e.finding, readAt: nowISO } };
            }
            if (
              kind === "activity" &&
              e.kind !== "finding" &&
              e.activity.id === id
            ) {
              return { ...e, activity: { ...e.activity, readAt: nowISO } };
            }
            return e;
          });
          return Array.isArray(prev) ? next : { ...prev, entries: next };
        },
      );
      qc.setQueriesData<{ findings: Finding[] } | undefined>(
        { queryKey: ["findings"] },
        (prev) => {
          if (!prev || kind !== "finding") return prev;
          return {
            ...prev,
            findings: prev.findings.map((f) =>
              f.id === id ? { ...f, readAt: nowISO } : f,
            ),
          };
        },
      );
      qc.setQueriesData<{ activity: RepoActivity[] } | undefined>(
        { queryKey: ["repo-activity"] },
        (prev) => {
          if (!prev || kind !== "activity") return prev;
          return {
            ...prev,
            activity: prev.activity.map((a) =>
              a.id === id ? { ...a, readAt: nowISO } : a,
            ),
          };
        },
      );
    },
    // No onSettled invalidate — optimistic update is authoritative; a hard
    // refetch on every read mark would churn the feed list in place.
  });
}

export function useDismissFinding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (findingId: number) =>
      request<{ ok: boolean }>(`/api/findings/${findingId}/dismiss`, {
        method: "POST",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["findings"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["across"] });
      qc.invalidateQueries({ queryKey: ["whats-new"] });
    },
  });
}
