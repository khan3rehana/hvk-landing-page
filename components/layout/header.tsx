"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { Menu, X } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { NAV_LINKS, SITE_NAME, SITE_TAGLINE } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function Header() {
  const [scrolled, setScrolled] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  React.useEffect(() => {
    function handleScroll() {
      setScrolled(window.scrollY > 8);
    }
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 bg-white transition-shadow duration-300 dark:bg-dark-bg",
        scrolled
          ? "shadow-card border-b border-slate-100 dark:border-white/10"
          : "border-b border-transparent"
      )}
    >
      <div className="container flex h-[72px] items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-3">
          <Image
            src="/images/hvk-logo.png"
            alt="HVK Infotech logo"
            width={48}
            height={48}
            priority
            className="h-11 w-11 rounded-full object-cover"
          />
          <span className="flex flex-col leading-tight">
            <span className="text-lg font-bold text-navy dark:text-white sm:text-xl">
              {SITE_NAME}
            </span>
            <span className="text-[11px] font-medium tracking-wide text-muted dark:text-slate-400 sm:text-xs">
              {SITE_TAGLINE}
            </span>
          </span>
        </Link>

        <nav
          className="hidden items-center gap-8 lg:flex"
          aria-label="Primary navigation"
        >
          {NAV_LINKS.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="text-sm font-semibold text-ink transition-colors hover:text-bright-blue dark:text-slate-200 dark:hover:text-bright-blue"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />

          <Link
            href="#registration"
            className={cn(buttonVariants({ variant: "primary" }), "hidden lg:inline-flex")}
          >
            Register Now
            <span aria-hidden="true">→</span>
          </Link>

          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-navy hover:bg-light-blue dark:text-slate-200 dark:hover:bg-white/10 lg:hidden"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            aria-controls="mobile-menu"
          >
            {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      <div
        id="mobile-menu"
        className={cn(
          "overflow-hidden bg-white transition-[max-height] duration-300 ease-in-out dark:bg-dark-bg lg:hidden",
          mobileOpen ? "max-h-[420px] border-b border-slate-100 dark:border-white/10" : "max-h-0"
        )}
      >
        <nav
          className="container flex flex-col gap-1 py-3"
          aria-label="Mobile navigation"
        >
          {NAV_LINKS.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              onClick={() => setMobileOpen(false)}
              className="rounded-lg px-3 py-3 text-sm font-semibold text-ink transition-colors hover:bg-light-blue hover:text-bright-blue dark:text-slate-200 dark:hover:bg-white/10"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="#registration"
            onClick={() => setMobileOpen(false)}
            className="mt-2 flex items-center justify-center gap-2 rounded-lg bg-bright-blue px-5 py-3 text-sm font-semibold text-white hover:bg-primary-blue"
          >
            Register Now →
          </Link>
        </nav>
      </div>
    </header>
  );
}
