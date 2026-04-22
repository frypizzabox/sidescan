import { useEffect, useState } from "react";

export type ThemeMode = "light" | "dark" | "system";

const STORAGE_KEY = "sidescan.theme";

function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyTheme(mode: ThemeMode): void {
  const dark = mode === "dark" || (mode === "system" && systemPrefersDark());
  document.documentElement.classList.toggle("dark", dark);
}

function readStored(): ThemeMode {
  const v = localStorage.getItem(STORAGE_KEY);
  if (v === "light" || v === "dark" || v === "system") return v;
  return "system";
}

/**
 * Inline boot script (called from index.html) avoids a light-mode flash on
 * reload when the user has dark saved. Kept as a named export so the
 * build pipeline picks it up and we have one source of truth.
 */
export function bootTheme(): void {
  applyTheme(readStored());
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", () => {
      if (readStored() === "system") applyTheme("system");
    });
}

export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(() => readStored());

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, mode);
    applyTheme(mode);
  }, [mode]);

  return { mode, setMode };
}
