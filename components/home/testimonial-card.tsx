import Image from "next/image";
import { Quote, Star } from "lucide-react";
import type { TestimonialItem } from "@/types";

export function TestimonialCard({
  name,
  education,
  rating,
  quote,
  avatar,
}: TestimonialItem) {
  return (
    <div className="flex h-full flex-col rounded-xl2 bg-white p-6 shadow-card dark:bg-dark-surface-alt sm:p-7">
      <Quote className="h-7 w-7 text-light-blue dark:text-bright-blue/30" aria-hidden="true" fill="currentColor" />
      <p className="mt-4 flex-1 text-sm leading-relaxed text-ink dark:text-slate-200">
        &ldquo;{quote}&rdquo;
      </p>
      <div className="mt-5 flex items-center gap-3 border-t border-slate-100 pt-5 dark:border-white/10">
        <Image
          src={avatar}
          alt={`${name} portrait`}
          width={48}
          height={48}
          className="h-12 w-12 rounded-full object-cover"
        />
        <div>
          <p className="text-sm font-bold text-navy dark:text-white">{name}</p>
          <p className="text-xs text-muted dark:text-slate-400">{education}</p>
          <div className="mt-1 flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
            {Array.from({ length: 5 }).map((_, index) => (
              <Star
                key={index}
                className={
                  index < rating
                    ? "h-3.5 w-3.5 fill-amber-400 text-amber-400"
                    : "h-3.5 w-3.5 text-slate-200 dark:text-slate-600"
                }
                aria-hidden="true"
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
