import * as React from "react";
import { cn } from "@/lib/utils";

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-xl2 border border-slate-100 bg-white shadow-card dark:border-white/10 dark:bg-dark-surface",
      className
    )}
    {...props}
  />
));
Card.displayName = "Card";

export { Card };
