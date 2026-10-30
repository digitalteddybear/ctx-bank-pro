"use client";

import { Children, isValidElement, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from "react";
import { Badge as AstryxBadge } from "@astryxdesign/core/Badge";
import { Button as AstryxButton } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { IconButton as AstryxIconButton } from "@astryxdesign/core/IconButton";
import { Skeleton as AstryxSkeleton } from "@astryxdesign/core/Skeleton";

export function cx(...classes: Array<string | undefined | false | null>) {
  return classes.filter(Boolean).join(" ");
}

function labelFromChildren(children: ReactNode): string {
  return Children.toArray(children)
    .map((child) => {
      if (typeof child === "string" || typeof child === "number") return String(child);
      if (isValidElement<{ children?: ReactNode }>(child) && typeof child.type === "string") {
        return labelFromChildren(child.props.children);
      }
      return "";
    })
    .join(" ")
    .trim() || "Action";
}

export function IconButton({
  label,
  active,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  active?: boolean;
  children: ReactNode;
}) {
  return <AstryxIconButton {...props} className={cx("icon-button", active && "is-active", className)} icon={children} label={label} />;
}

export function Button({
  variant = "primary",
  size = "md",
  loading,
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  loading?: boolean;
}) {
  return (
    <AstryxButton
      {...props}
      className={cx("button", `button--${variant}`, `button--${size}`, className)}
      isDisabled={loading || props.disabled}
      isLoading={loading}
      label={labelFromChildren(children)}
      size={size}
      variant={variant === "danger" ? "destructive" : variant}
    >
      <span className="button__content">{children}</span>
    </AstryxButton>
  );
}

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: "neutral" | "success" | "warning" | "danger" | "accent" | "cyan";
  children: ReactNode;
  className?: string;
}) {
  const variant = tone === "danger" ? "error" : tone === "accent" ? "blue" : tone;
  return <AstryxBadge className={cx("badge", `badge--${tone}`, className)} label={children} variant={variant} />;
}

export function Panel({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <Card {...props} className={cx("panel", className)} padding={4}>{children}</Card>;
}

export function Skeleton({ className }: { className?: string }) {
  return <AstryxSkeleton className={cx("skeleton", className)} />;
}
