import Image from "next/image";
import Link from "next/link";
import { Clock, Mail, MapPin, Phone } from "lucide-react";
import {
  CONTACT_EMAIL,
  FOOTER_LINK_GROUPS,
  OFFICE_LOCATION,
  PHONE_NUMBER,
  PHONE_NUMBER_HREF,
  SITE_NAME,
  SITE_TAGLINE,
  SOCIAL_LINKS,
  WORKING_HOURS,
} from "@/lib/constants";
import type { FooterLinkGroupData } from "@/types";

function FooterLinkGroup({ title, links }: FooterLinkGroupData) {
  return (
    <div>
      <h3 className="text-sm font-semibold uppercase tracking-wide text-navy dark:text-white">
        {title}
      </h3>
      <ul className="mt-4 space-y-2.5">
        {links.map((link) => (
          <li key={`${title}-${link.label}`}>
            <Link
              href={link.href}
              className="text-sm text-muted transition-colors hover:text-primary-blue dark:text-white/70 dark:hover:text-bright-blue"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="bg-light-blue text-ink dark:bg-navy dark:text-white" id="contact">
      <div className="container grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
        <div className="sm:col-span-2 lg:col-span-1">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/images/hvk-logo.png"
              alt="HVK Infotech logo"
              width={44}
              height={44}
              className="h-11 w-11 rounded-full object-cover"
            />
            <span className="flex flex-col leading-tight">
              <span className="text-lg font-bold text-navy dark:text-white">{SITE_NAME}</span>
              <span className="text-xs font-medium text-muted dark:text-white/60">
                {SITE_TAGLINE}
              </span>
            </span>
          </Link>
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted dark:text-white/70">
            Empowering individuals with the skills, knowledge and opportunities
            to create a better tomorrow.
          </p>
          <ul className="mt-5 flex items-center gap-3" aria-label="Social media links">
            {SOCIAL_LINKS.map((social) => (
              <li key={social.label}>
                <a
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={social.label}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-navy/15 text-muted transition-colors hover:border-bright-blue hover:bg-bright-blue hover:text-white dark:border-white/15 dark:text-white/80"
                >
                  <social.icon className="h-4 w-4" aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
        </div>

        {FOOTER_LINK_GROUPS.map((group) => (
          <FooterLinkGroup key={group.title} {...group} />
        ))}

        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-navy dark:text-white">
            Contact Us
          </h3>
          <ul className="mt-4 space-y-3 text-sm text-muted dark:text-white/70">
            <li className="flex items-start gap-2.5">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-bright-blue" aria-hidden="true" />
              <span>{OFFICE_LOCATION}</span>
            </li>
            <li className="flex items-center gap-2.5">
              <Phone className="h-4 w-4 shrink-0 text-bright-blue" aria-hidden="true" />
              <a href={PHONE_NUMBER_HREF} className="hover:text-bright-blue">
                {PHONE_NUMBER}
              </a>
            </li>
            <li className="flex items-center gap-2.5">
              <Mail className="h-4 w-4 shrink-0 text-bright-blue" aria-hidden="true" />
              <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-bright-blue">
                {CONTACT_EMAIL}
              </a>
            </li>
            <li className="flex items-center gap-2.5">
              <Clock className="h-4 w-4 shrink-0 text-bright-blue" aria-hidden="true" />
              <span>{WORKING_HOURS}</span>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-navy/10 dark:border-white/10">
        <div className="container flex flex-col items-center justify-between gap-3 py-5 text-xs text-muted dark:text-white/60 sm:flex-row">
          <p>© 2026 HVK Infotech. All rights reserved.</p>
          <div className="flex items-center gap-5">
            <Link href="/privacy-policy" className="hover:text-bright-blue">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-bright-blue">
              Terms & Conditions
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
