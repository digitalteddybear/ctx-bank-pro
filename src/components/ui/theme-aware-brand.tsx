"use client";

import Image from "next/image";
import { useApplicationTheme } from "./astryx-theme-provider";

export function ThemeAwareBrand({ width, height }: { width: number; height: number }) {
  const { theme } = useApplicationTheme();

  return (
    <Image
      src={theme === "light" ? "/assets/dark-ctx.svg" : "/assets/light-ctx.svg"}
      alt=""
      aria-hidden="true"
      width={width}
      height={height}
      priority
    />
  );
}
