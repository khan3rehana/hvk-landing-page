"use client";

import { SERVICES } from "@/lib/constants";
import { ServiceCard } from "@/components/home/service-card";

export function ServicesSection() {
  return (
    <section id="services" className="py-16 sm:py-20 lg:py-24">
      <div className="container">
        <div className="mx-auto max-w-2xl text-center">
          <div className="flex items-center justify-center gap-3">
            <span className="h-px w-8 bg-primary-blue" aria-hidden="true" />
            <h2 className="text-2xl font-extrabold text-navy dark:text-white sm:text-3xl">
              Our Services
            </h2>
            <span className="h-px w-8 bg-primary-blue" aria-hidden="true" />
          </div>
          <p className="mt-3 text-sm leading-relaxed text-muted dark:text-slate-400 sm:text-base">
            Comprehensive solutions to help you grow and succeed in your career.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3 lg:grid-cols-6">
          {SERVICES.map((service) => (
            <ServiceCard key={service.id} {...service} />
          ))}
        </div>
      </div>
    </section>
  );
}
