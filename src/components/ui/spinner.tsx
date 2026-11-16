import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

// Busy indicator for a disabled submit/action button. shadcn/ui ships no spinner
// primitive (its own recipes spin a lucide icon), so this is the one hand-rolled
// atom the loading spec needs. The ring is drawn in `currentColor`, so the same
// class reads correctly on a primary, outline, or ghost button without variants.
// Animation comes from `.dos-spinner` in globals.css, which is reduced-motion safe.
export function Spinner({ className, ...props }: ComponentProps<"span">) {
  return <span aria-hidden="true" className={cn("dos-spinner", className)} {...props} />;
}
