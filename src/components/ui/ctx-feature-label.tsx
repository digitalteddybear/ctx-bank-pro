"use client";

import { type ReactNode } from "react";
import { CtxIcon } from "./ctx-icon";
import { cx } from "./primitives";

export interface CtxFeatureLabelProps {
  label: ReactNode;
  variant?: "inline" | "badge" | "header" | "pill";
  size?: "sm" | "md" | "lg";
  className?: string;
  badgeContent?: ReactNode;
  iconOnly?: boolean;
}

export function CtxFeatureLabel({
  label,
  variant = "inline",
  size = "md",
  className,
  badgeContent,
  iconOnly = false,
}: CtxFeatureLabelProps) {
  const iconSize = size === "sm" ? 18 : size === "lg" ? 26 : 22;

  if (iconOnly) {
    return <CtxIcon size={iconSize} className={className} />;
  }

  if (variant === "header") {
    return (
      <div className={cx("ctx-feature-label", className)}>
        <CtxIcon size={iconSize} />
        <span className={size === "lg" ? "text-lg font-semibold tracking-tight" : "text-sm font-semibold"}>
          {label}
        </span>
        {badgeContent && <span className="ml-2">{badgeContent}</span>}
      </div>
    );
  }

  return (
    <span
      className={cx(
        "ctx-feature-label",
        size === "sm" && "text-xs",
        size === "lg" && "text-base",
        className
      )}
    >
      <CtxIcon size={iconSize} />
      <span className="font-medium text-inherit">{label}</span>
      {badgeContent && <span className="ml-1.5">{badgeContent}</span>}
    </span>
  );
}
