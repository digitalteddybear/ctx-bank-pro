"use client";

import { useId } from "react";
import { useApplicationTheme } from "./astryx-theme-provider";

export interface CtxIconProps {
  size?: number;
  className?: string;
  themeOverride?: "light" | "dark";
}

export function CtxIcon({ size = 16, className, themeOverride }: CtxIconProps) {
  const { theme } = useApplicationTheme();
  const activeTheme = themeOverride ?? theme ?? "dark";
  const idPrefix = useId().replace(/:/g, "");

  const width = Math.round((size * 56) / 75);
  const height = size;

  const isLight = activeTheme === "light";

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 56 75"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0 }}
    >
      <defs>
        {isLight ? (
          <>
            <linearGradient id={`${idPrefix}-p0`} x1="24.5" y1="75" x2="37.55" y2="44.05" gradientUnits="userSpaceOnUse">
              <stop stopColor="#44799D" />
              <stop offset="0.524" stopColor="#2E404D" />
              <stop offset="1" stopColor="#4A4A4A" />
            </linearGradient>
            <linearGradient id={`${idPrefix}-p1`} x1="10.39" y1="21.16" x2="11" y2="70.5" gradientUnits="userSpaceOnUse">
              <stop stopColor="#2B2B2B" />
              <stop offset="1" stopColor="#5CA2D3" />
            </linearGradient>
            <linearGradient id={`${idPrefix}-p2`} x1="36" y1="5.5" x2="46" y2="48.5" gradientUnits="userSpaceOnUse">
              <stop stopColor="#000000" />
              <stop offset="0.524" stopColor="#161616" />
              <stop offset="1" stopColor="#494949" />
            </linearGradient>
            <linearGradient id={`${idPrefix}-p3`} x1="10" y1="27" x2="44.48" y2="5.47" gradientUnits="userSpaceOnUse">
              <stop stopColor="#2E3337" />
              <stop offset="1" stopColor="#474747" />
            </linearGradient>
          </>
        ) : (
          <>
            <linearGradient id={`${idPrefix}-p0`} x1="24.5" y1="75" x2="37.55" y2="44.05" gradientUnits="userSpaceOnUse">
              <stop stopColor="#4899D1" />
              <stop offset="0.474" stopColor="#4D95C7" />
              <stop offset="1" stopColor="#C9E9FF" />
            </linearGradient>
            <linearGradient id={`${idPrefix}-p1`} x1="10.39" y1="21.16" x2="11" y2="70.5" gradientUnits="userSpaceOnUse">
              <stop stopColor="#FFFFFF" />
              <stop offset="1" stopColor="#85CDFF" />
            </linearGradient>
            <linearGradient id={`${idPrefix}-p2`} x1="36" y1="5.5" x2="46" y2="48.5" gradientUnits="userSpaceOnUse">
              <stop stopColor="#000000" />
              <stop offset="0.507" stopColor="#ADADAD" />
              <stop offset="1" stopColor="#C2E4FC" />
            </linearGradient>
            <linearGradient id={`${idPrefix}-p3`} x1="10" y1="27" x2="44.48" y2="5.47" gradientUnits="userSpaceOnUse">
              <stop stopColor="#F3F3F3" />
              <stop offset="1" stopColor="#E6E6E6" />
            </linearGradient>
          </>
        )}
      </defs>
      <path d="M36 42L56 54L21 75L0 63L36 42Z" fill={`url(#${idPrefix}-p0)`} />
      <path d="M0 21L21 33V75L0 63V21Z" fill={`url(#${idPrefix}-p1)`} />
      <path d="M36 0L56 12V54L36 42V0Z" fill={`url(#${idPrefix}-p2)`} />
      <path d="M36 0L56 12L21 33L0 21L36 0Z" fill={`url(#${idPrefix}-p3)`} />
    </svg>
  );
}
