import Link from "next/link";
import { HelpCircle, Phone } from "lucide-react";
import { PHONE_NUMBER, PHONE_NUMBER_HREF, SOCIAL_LINKS } from "@/lib/constants";

export function AnnouncementBar() {
  return (
    <div className="bg-light-blue text-ink dark:bg-navy dark:text-white">
      <div className="container flex h-9 items-center justify-between gap-4 text-xs sm:text-sm">
        <p className="truncate font-medium">
          <span className="hidden sm:inline">
            Empowering Talent. Building Careers. Join HVK Infotech Today!
          </span>
          <span className="sm:hidden">Join HVK Infotech Today!</span>
        </p>
        <div className="flex items-center gap-3 sm:gap-4">
          <ul className="hidden items-center gap-3 md:flex" aria-label="Social media links">
            {SOCIAL_LINKS.map((social) => (
              <li key={social.label}>
                <a
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={social.label}
                  className="text-muted transition-colors hover:text-primary-blue dark:text-white/80 dark:hover:text-bright-blue"
                >
                  <social.icon className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
          <span className="hidden h-4 w-px bg-navy/15 dark:bg-white/20 md:block" aria-hidden="true" />
          <Link
            href="/#contact"
            className="hidden items-center gap-1.5 text-muted transition-colors hover:text-primary-blue dark:text-white/80 dark:hover:text-bright-blue lg:flex"
          >
            <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
            Need Help?
          </Link>
          <a
            href={PHONE_NUMBER_HREF}
            className="flex items-center gap-1.5 font-semibold text-navy transition-colors hover:text-primary-blue dark:text-white dark:hover:text-bright-blue"
          >
            <Phone className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="whitespace-nowrap">{PHONE_NUMBER}</span>
          </a>
        </div>
      </div>
    </div>
  );
}
