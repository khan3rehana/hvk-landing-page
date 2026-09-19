import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: LucideIcon;
  error?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, icon: Icon, error, id, ...props }, ref) => {
    return (
      <div className="relative">
        {Icon ? (
          <Icon
            aria-hidden="true"
            className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-muted dark:text-slate-500"
          />
        ) : null}
        <input
          id={id}
          ref={ref}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          className={cn(
            "h-12 w-full rounded-lg border border-slate-200 bg-white text-sm text-ink placeholder:text-slate-400 transition-colors duration-200 focus:border-bright-blue focus:outline-none focus:ring-2 focus:ring-bright-blue/20 dark:border-white/10 dark:bg-dark-surface-alt dark:text-slate-100 dark:placeholder:text-slate-500",
            Icon ? "pl-10 pr-3.5" : "px-3.5",
            error && "border-red-400 focus:border-red-500 focus:ring-red-100 dark:border-red-400/70",
            className
          )}
          {...props}
        />
        {error ? (
          <p id={`${id}-error`} className="mt-1.5 text-xs font-medium text-red-500">
            {error}
          </p>
        ) : null}
      </div>
    );
  }
);
Input.displayName = "Input";

export { Input };
