import { useQuery } from "@tanstack/react-query";

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
}

export interface Repo {
  id: number;
  path: string;
  lastScannedAt: string | null;
}

export interface ProjectDetail {
  project: Project;
  repos: Repo[];
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
}

async function request<T>(path: string): Promise<T> {
  const res = await fetch(path);
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
