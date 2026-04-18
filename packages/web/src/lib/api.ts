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
  lastScannedAt: string | null;
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
}

export type FindingSource = "github_similar" | "hn" | "ph" | "web";
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
}

export interface RepoActivity {
  id: number;
  kind: "commit" | "release" | "issue" | "pr";
  ref: string;
  title: string;
  event_date: string;
  url: string | null;
  repo_id: number;
}

export interface WhatsNewResponse {
  content: string | null;
  createdAt: string | null;
  scanId: number | null;
  newCount: number;
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
