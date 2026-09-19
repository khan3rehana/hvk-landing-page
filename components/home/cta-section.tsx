import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function CtaSection() {
  return (
    <section className="bg-light-blue py-12 dark:bg-dark-surface sm:py-14">
      <div className="container flex flex-col items-center justify-between gap-6 text-center sm:flex-row sm:text-left">
        <div>
          <h2 className="text-2xl font-extrabold text-navy dark:text-white sm:text-3xl">
            Ready to Build Your Future?
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted dark:text-slate-400 sm:text-base">
            Join thousands of students who are already on the path to success.
          </p>
        </div>
        <Link
          href="#registration"
          className={cn(buttonVariants({ variant: "primary", size: "lg" }), "shrink-0")}
        >
          Register Now
          <span aria-hidden="true">→</span>
        </Link>
      </div>
    </section>
  );
}
