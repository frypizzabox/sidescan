import { useSyncExternalStore } from "react";

export type Density = "compact" | "comfortable";
export type ReadStyle = "rail" | "tint" | "dot";
export type CompetitorsGrid = "one-col" | "two-col";

export interface Prefs {
  density: Density;
  readStyle: ReadStyle;
  showThumbs: boolean;
  showDigest: boolean;
  showKeywordScore: boolean;
  competitorsGrid: CompetitorsGrid;
}

const DEFAULTS: Prefs = {
  density: "comfortable",
  readStyle: "rail",
  showThumbs: true,
  showDigest: true,
  showKeywordScore: true,
  competitorsGrid: "one-col",
};

const STORAGE_KEY = "sidescan:prefs";

function read(): Prefs {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

function write(next: Prefs) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event("sidescan:prefs"));
  } catch {
    /* ignore */
  }
}

function subscribe(cb: () => void) {
  window.addEventListener("sidescan:prefs", cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener("sidescan:prefs", cb);
    window.removeEventListener("storage", cb);
  };
}

export function usePrefs(): [Prefs, (patch: Partial<Prefs>) => void] {
  const snap = useSyncExternalStore(subscribe, read, () => DEFAULTS);
  const set = (patch: Partial<Prefs>) => write({ ...snap, ...patch });
  return [snap, set];
}
