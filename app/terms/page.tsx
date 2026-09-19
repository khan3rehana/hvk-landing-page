import type { Metadata } from "next";
import { CONTACT_EMAIL, SITE_NAME } from "@/lib/constants";

export const metadata: Metadata = {
  title: `Terms & Conditions | ${SITE_NAME}`,
  robots: { index: false, follow: true },
};

const SECTIONS = [
  {
    heading: "Acceptance of Terms",
    body: `By registering for a program or using this website, you agree to be bound by these Terms & Conditions. If you do not agree with any part of these terms, please do not use our services.`,
  },
  {
    heading: "Registration",
    body: "Registration requires accurate and complete information. Providing false information may result in your registration being cancelled without a refund.",
  },
  {
    heading: "Payments",
    body: `The registration fee is processed securely through our payment partner. Your seat is confirmed only once payment has been successfully verified.`,
  },
  {
    heading: "Refunds & Cancellations",
    body: "Refund and cancellation requests are reviewed on a case-by-case basis. Please contact us directly with your registration details for any refund-related query.",
  },
  {
    heading: "Program Changes",
    body: `${SITE_NAME} reserves the right to modify program schedules, content, or delivery format where necessary, and will make reasonable efforts to inform registered candidates of any material changes.`,
  },
  {
    heading: "Limitation of Liability",
    body: `${SITE_NAME} is not liable for any indirect or incidental damages arising from the use of our website or participation in our programs.`,
  },
  {
    heading: "Changes to These Terms",
    body: "We may revise these Terms & Conditions from time to time. Continued use of our services after changes are posted constitutes acceptance of the revised terms.",
  },
];

export default function TermsPage() {
  return (
    <section className="bg-app-bg py-16 dark:bg-dark-bg sm:py-20">
      <div className="container max-w-3xl">
        <span className="text-xs font-bold uppercase tracking-[0.15em] text-primary-blue dark:text-bright-blue">
          Legal
        </span>
        <h1 className="mt-2 text-2xl font-extrabold text-navy dark:text-white sm:text-3xl">
          Terms &amp; Conditions
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-muted dark:text-slate-400">
          These Terms &amp; Conditions govern your use of the {SITE_NAME} website and
          registration for our programs.
        </p>

        <div className="mt-10 space-y-8">
          {SECTIONS.map((section) => (
            <div key={section.heading}>
              <h2 className="text-lg font-bold text-navy dark:text-white">
                {section.heading}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted dark:text-slate-400">
                {section.body}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-10 border-t border-slate-100 pt-6 dark:border-white/10">
          <h2 className="text-lg font-bold text-navy dark:text-white">Contact Us</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted dark:text-slate-400">
            If you have questions about these Terms &amp; Conditions, please reach out to
            us at{" "}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="font-semibold text-primary-blue hover:underline dark:text-bright-blue"
            >
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </div>
      </div>
    </section>
  );
}
