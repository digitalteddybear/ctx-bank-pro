"use client";

import { createContext, useCallback, useContext, useLayoutEffect, useSyncExternalStore, type ReactNode } from "react";

type ApplicationTheme = "dark" | "light";
export type ThemePreference = "system" | ApplicationTheme;

const preferenceStorageKey = "ctxbankpro:theme-preference";
const legacyThemeStorageKey = "ctxbankpro:application-theme";
const themeListeners = new Set<() => void>();

const ApplicationThemeContext = createContext<{
  theme: ApplicationTheme;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
} | null>(null);

function systemTheme(): ApplicationTheme {
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function readPreference(): ThemePreference {
  const preference = window.localStorage.getItem(preferenceStorageKey);
  if (preference === "system" || preference === "light" || preference === "dark") return preference;
  const legacyTheme = window.localStorage.getItem(legacyThemeStorageKey);
  return legacyTheme === "light" || legacyTheme === "dark" ? legacyTheme : "system";
}

function resolveTheme(preference: ThemePreference): ApplicationTheme {
  return preference === "system" ? systemTheme() : preference;
}

function readThemeSnapshot() {
  const preference = readPreference();
  return `${preference}:${resolveTheme(preference)}`;
}

function readServerThemeSnapshot() {
  // This must stay identical for SSR and the first client hydration render.
  // The pre-hydration script in the root layout owns the visible document theme.
  return "system:dark";
}

function notifyThemeListeners() {
  themeListeners.forEach((listener) => listener());
}

function subscribeToTheme(listener: () => void) {
  themeListeners.add(listener);
  const mediaQuery = window.matchMedia("(prefers-color-scheme: light)");
  const onSystemThemeChange = () => {
    if (readPreference() === "system") notifyThemeListeners();
  };
  const onStorageChange = (event: StorageEvent) => {
    if (event.key === preferenceStorageKey || event.key === legacyThemeStorageKey) notifyThemeListeners();
  };
  mediaQuery.addEventListener("change", onSystemThemeChange);
  window.addEventListener("storage", onStorageChange);
  return () => {
    themeListeners.delete(listener);
    mediaQuery.removeEventListener("change", onSystemThemeChange);
    window.removeEventListener("storage", onStorageChange);
  };
}

export function useApplicationTheme() {
  const context = useContext(ApplicationThemeContext);
  if (!context) throw new Error("useApplicationTheme must be used within AstryxThemeProvider");
  return context;
}

export function AstryxThemeProvider({ children }: { children: ReactNode }) {
  const snapshot = useSyncExternalStore(
    subscribeToTheme,
    readThemeSnapshot,
    readServerThemeSnapshot,
  );
  const [preference, theme] = snapshot.split(":") as [ThemePreference, ApplicationTheme];

  useLayoutEffect(() => {
    // Do not overwrite the preference applied before React hydrates. The external
    // store will immediately reconcile this fallback with localStorage instead.
    if (document.documentElement.dataset.themePreference && document.documentElement.dataset.theme !== theme) return;
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const setPreference = useCallback((nextPreference: ThemePreference) => {
    const nextTheme = resolveTheme(nextPreference);
    window.localStorage.setItem(preferenceStorageKey, nextPreference);
    document.documentElement.dataset.theme = nextTheme;
    document.documentElement.dataset.themePreference = nextPreference;
    notifyThemeListeners();
  }, []);

  return (
    <ApplicationThemeContext value={{ theme, preference, setPreference }}>
      {children}
    </ApplicationThemeContext>
  );
}
