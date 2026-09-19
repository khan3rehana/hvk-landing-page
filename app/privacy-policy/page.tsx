import type { Metadata } from "next";
import { CONTACT_EMAIL, SITE_NAME } from "@/lib/constants";

export const metadata: Metadata = {
  title: `Privacy Policy | ${SITE_NAME}`,
  robots: { index: false, follow: true },
};

const SECTIONS = [
  {
    heading: "Information We Collect",
    body: "When you register for a program with us, we collect the details you submit through our registration form — such as your name, email address, phone number, college, and location — along with payment confirmation details from our payment processor.",
  },
  {
    heading: "How We Use Your Information",
    body: "We use this information to process your registration, confirm your payment, issue exam access where applicable, and communicate important updates about our programs. We do not sell your personal information to third parties.",
  },
  {
    heading: "Payment Processing",
    body: "Payments are handled by a third-party payment gateway. We do not store your card, UPI, or bank details on our servers — that data is processed directly by our payment partner under their own security and privacy practices.",
  },
  {
    heading: "Data Security",
    body: "We take reasonable technical and organizational measures to protect your personal information from unauthorized access, alteration, or disclosure.",
  },
  {
    heading: "Your Rights",
    body: "You may contact us at any time to request access to, correction of, or deletion of the personal information we hold about you.",
  },
  {
    heading: "Changes to This Policy",
    body: "We may update this policy from time to time. Continued use of our services after changes are posted constitutes acceptance of the revised policy.",
  },
];

export default function PrivacyPolicyPage() {
  return (
    <section className="bg-app-bg py-16 dark:bg-dark-bg sm:py-20">
      <div className="container max-w-3xl">
        <span className="text-xs font-bold uppercase tracking-[0.15em] text-primary-blue dark:text-bright-blue">
          Legal
        </span>
        <h1 className="mt-2 text-2xl font-extrabold text-navy dark:text-white sm:text-3xl">
          Privacy Policy
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-muted dark:text-slate-400">
          This Privacy Policy explains how {SITE_NAME} collects, uses, and protects
          the personal information you share with us through our website.
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
            If you have questions about this Privacy Policy, please reach out to us at{" "}
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
