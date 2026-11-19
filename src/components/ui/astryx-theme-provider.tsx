"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, useLayoutEffect, useSyncExternalStore, type ReactNode } from "react";

type ApplicationTheme = "dark" | "light";
export type ThemePreference = "system" | ApplicationTheme;

const preferenceStorageKey = "ctxbankpro:theme-preference";
const legacyThemeStorageKey = "ctxbankpro:application-theme";
const themeListeners = new Set<() => void>();

const ApplicationThemeContext = createContext<{
  theme: ApplicationTheme;
  preference: ThemePreference;
  saveError: string;
  setPreference: (preference: ThemePreference) => void;
} | null>(null);

function systemTheme(): ApplicationTheme {
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function readPreference(): ThemePreference {
  try {
  const preference = window.localStorage.getItem(preferenceStorageKey);
  if (preference === "system" || preference === "light" || preference === "dark") return preference;
  const legacyTheme = window.localStorage.getItem(legacyThemeStorageKey);
  return legacyTheme === "light" || legacyTheme === "dark" ? legacyTheme : "system";
  } catch {
    const value=document.documentElement.dataset.themePreference;
    return value==="light"||value==="dark"?value:"system";
  }
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
    if(snapshot!==readThemeSnapshot())return;
    document.documentElement.dataset.themePreference=preference;
    document.documentElement.dataset.theme = theme;
  }, [snapshot,preference,theme]);

  const applyPreference = useCallback((nextPreference: ThemePreference) => {
    const nextTheme = resolveTheme(nextPreference);
    try{window.localStorage.setItem(preferenceStorageKey,nextPreference);}catch{/* The active document retains the preference. */}
    document.documentElement.dataset.theme = nextTheme;
    document.documentElement.dataset.themePreference = nextPreference;
    notifyThemeListeners();
  }, []);

  const [saveError,setSaveError]=useState("");
  const change=useRef(0);
  const role=useRef<string|null|undefined>(undefined);
  const queue=useRef(Promise.resolve());
  const readSession=useCallback(async()=>{
    const response=await fetch("/api/session",{cache:"no-store"});
    if(!response.ok)throw new Error("Appearance settings unavailable.");
    return await response.json() as {role:string|null;themePreference?:ThemePreference|null};
  },[]);
  useEffect(()=>{
    let active=true;
    const initial=change.current;
    void readSession().then(session=>{
      if(active)role.current=session.role;
      if(active&&initial===change.current&&session.role==="administrator"&&session.themePreference)
        applyPreference(session.themePreference);
    }).catch(()=>{/* Local preference stays available while offline. */});
    return ()=>{active=false;};
  },[readSession,applyPreference]);
  const setPreference=useCallback((value:ThemePreference)=>{
    const revision=++change.current;
    applyPreference(value);
    setSaveError("");
    queue.current=queue.current.then(async()=>{
      if(revision!==change.current)return;
      const activeRole=role.current===undefined?(await readSession()).role:role.current;
      if(activeRole!=="administrator"||revision!==change.current)return;
      const response=await fetch("/api/session",{method:"PATCH",keepalive:true,headers:{"content-type":"application/json"},body:JSON.stringify({themePreference:value})});
      if(!response.ok)throw new Error("Appearance could not be saved to your profile.");
    }).catch(()=>{if(revision===change.current)setSaveError("Appearance could not be saved to your profile.");});
  },[applyPreference,readSession]);

  return (
    <ApplicationThemeContext value={{ theme, preference, setPreference, saveError }}>
      {children}
    </ApplicationThemeContext>
  );
}
