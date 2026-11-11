import * as React from "react";
import { cn } from "@/lib/utils";

export const fieldClass =
  "h-11 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-base sm:h-10 sm:text-sm shadow-xs outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-50 aria-invalid:border-danger";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input data-slot="input" className={cn(fieldClass, className)} {...props} />;
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea className={cn(fieldClass, "h-auto min-h-20 py-2", className)} {...props} />;
}

/** Native select: best touch UX on mobile (OS picker). */
export function Select({ className, ...props }: React.ComponentProps<"select">) {
  return <select className={cn(fieldClass, "appearance-none bg-[length:16px] bg-[right_0.75rem_center] bg-no-repeat pr-9", className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%237a8497' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }} {...props} />;
}
