"use client";

import { useEffect, useRef } from "react";

export function requestBackendSync() {
  window.dispatchEvent(new Event("ctx:backend-sync"));
}

/** Subscribe to the application poll without creating competing timers. */
export function useBackendRefresh(refresh: () => void | Promise<void>) {
  const latest = useRef(refresh);
  useEffect(() => { latest.current = refresh; });
  useEffect(() => {
    const update = () => { void latest.current(); };
    update();
    window.addEventListener("ctx:backend-updated", update);
    return () => window.removeEventListener("ctx:backend-updated", update);
  }, []);
}
