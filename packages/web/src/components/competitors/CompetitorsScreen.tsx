import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useFindings, useMarkRead, useProject } from "@/lib/api";
import { usePrefs } from "@/lib/prefs";
import { CompetitorCard } from "./CompetitorCard";
import {
  CompetitorControls,
  type CompetitorSort,
} from "./CompetitorControls";
import { parseCompetitor } from "./parse";

const DAY_MS = 86_400_000;

export function CompetitorsScreen() {
  const { slug } = useParams();
  const { data, isLoading, isError } = useFindings(slug, "github");
  const { data: project } = useProject(slug);
  const [prefs] = usePrefs();
  const markRead = useMarkRead();

  const [sort, setSort] = useState<CompetitorSort>("relevance");
  const [lang, setLang] = useState("all");
  const [activeOnly, setActiveOnly] = useState(false);
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());

  const repos = useMemo(
    () => (data?.findings ?? []).map(parseCompetitor),
    [data],
  );

  const languages = useMemo(() => {
    const set = new Set<string>();
    for (const r of repos) if (r.language) set.add(r.language);
    return Array.from(set).sort();
  }, [repos]);

  const filtered = useMemo(() => {
    const now = Date.now();
    let xs = repos.slice();
    if (lang !== "all") xs = xs.filter((r) => r.language === lang);
    if (activeOnly) {
      const cutoff = now - 30 * DAY_MS;
      xs = xs.filter(
        (r) =>
          r.lastPushedAt &&
          new Date(r.lastPushedAt).getTime() >= cutoff,
      );
    }
    xs.sort((a, b) => {
      if (sort === "stars") return (b.stars ?? -1) - (a.stars ?? -1);
      if (sort === "recent") {
        const at = a.lastPushedAt ? new Date(a.lastPushedAt).getTime() : 0;
        const bt = b.lastPushedAt ? new Date(b.lastPushedAt).getTime() : 0;
        return bt - at;
      }
      return (b.relevanceScore ?? -1) - (a.relevanceScore ?? -1);
    });
    return xs;
  }, [repos, sort, lang, activeOnly]);

  const visible = filtered.filter((r) => !dismissed.has(r.id));
  const dismissedRepos = filtered.filter((r) => dismissed.has(r.id));

  const toggleDismiss = (id: number, val: boolean) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      if (val) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="py-12 text-center text-sm text-ink-3">
        Loading competitors…
      </div>
    );
  }
  if (isError) {
    return (
      <div className="py-12 text-center text-sm text-red-600">
        Failed to load competitors.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-[13px] text-ink-3 leading-[18px] text-pretty">
        Public GitHub repos that overlap with{" "}
        <strong className="text-ink-2 font-medium">
          {project?.project.name ?? "this project"}
        </strong>{" "}
        by topic, language, and description. Sidescan uses two signals: an
        AI-judged relevance score and GitHub's keyword-match score.
      </div>

      <CompetitorControls
        sort={sort}
        setSort={setSort}
        lang={lang}
        setLang={setLang}
        activeOnly={activeOnly}
        setActiveOnly={setActiveOnly}
        languages={languages}
      />

      {visible.length === 0 ? (
        <div className="py-16 text-center text-[13px] text-ink-4">
          {repos.length === 0
            ? "No similar GitHub repos surfaced yet."
            : "No repos match these filters."}
        </div>
      ) : (
        <div
          className="grid gap-2"
          style={{
            gridTemplateColumns:
              prefs.competitorsGrid === "two-col"
                ? "repeat(2, minmax(0, 1fr))"
                : "1fr",
          }}
        >
          {visible.map((repo) => {
            const read = repo.readAt != null;
            return (
              <CompetitorCard
                key={repo.id}
                repo={repo}
                isRead={read}
                onOpen={() => {
                  if (!read) markRead.mutate({ kind: "finding", id: repo.id });
                }}
                onDismiss={() => toggleDismiss(repo.id, true)}
                density={prefs.density}
                readStyle={prefs.readStyle}
                showKeywordScore={prefs.showKeywordScore}
              />
            );
          })}
        </div>
      )}

      {dismissedRepos.length > 0 && (
        <details className="pt-2">
          <summary className="cursor-pointer text-[12px] text-ink-4 hover:text-ink-2 select-none">
            {dismissedRepos.length} dismissed
          </summary>
          <div className="mt-2 space-y-2">
            {dismissedRepos.map((repo) => (
              <div
                key={repo.id}
                className="rounded-md bg-surface ring-1 ring-inset ring-hairline p-3 flex items-center gap-3"
              >
                <span className="text-[13px] text-ink-4 truncate flex-1">
                  {repo.fullName} · dismissed
                </span>
                <button
                  type="button"
                  onClick={() => toggleDismiss(repo.id, false)}
                  className="text-[12px] text-ink-3 hover:text-ink-1"
                >
                  Undo
                </button>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
