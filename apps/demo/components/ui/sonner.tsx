"use client";

// Stock shadcn/ui sonner wrapper (new-york, Tailwind v4). @two-71/studio calls
// `toast()` from its own components and hooks, but deliberately doesn't mount a
// <Toaster /> — that would double up for consumers who already have one. Host
// apps render this once; the demo does it in app/providers.tsx.

import { useTheme } from "next-themes";
import type { CSSProperties } from "react";
import { Toaster as Sonner } from "sonner";
import type { ToasterProps } from "sonner";

type ToasterStyle = CSSProperties & {
  "--normal-bg": string;
  "--normal-border": string;
  "--normal-text": string;
};

const toasterStyle: ToasterStyle = {
  "--normal-bg": "var(--popover)",
  "--normal-border": "var(--border)",
  "--normal-text": "var(--popover-foreground)",
};

const isToasterTheme = (
  value: string
): value is NonNullable<ToasterProps["theme"]> =>
  value === "dark" || value === "light" || value === "system";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();
  const resolvedTheme = isToasterTheme(theme) ? theme : "system";

  return (
    <Sonner
      className="toaster group"
      style={toasterStyle}
      theme={resolvedTheme}
      {...props}
    />
  );
};

export { Toaster };
