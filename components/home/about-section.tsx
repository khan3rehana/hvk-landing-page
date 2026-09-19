"use client";

import { motion } from "framer-motion";
import { ABOUT_STATS } from "@/lib/constants";
import { buttonVariants } from "@/components/ui/button";
import { AboutCarousel } from "@/components/home/about-carousel";
import { cn } from "@/lib/utils";

export function AboutSection() {
  return (
    <section id="about" className="bg-app-bg py-16 dark:bg-dark-bg sm:py-20 lg:py-24">
      <div className="container grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          <AboutCarousel />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 30 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
        >
          <span className="text-xs font-bold uppercase tracking-[0.15em] text-primary-blue dark:text-bright-blue">
            About Us
          </span>
          <h2 className="mt-2 text-2xl font-extrabold text-navy dark:text-white sm:text-3xl lg:text-4xl">
            Empowering the Next Generation
          </h2>
          <p className="mt-4 text-base leading-relaxed text-muted dark:text-slate-400">
            HVK Infotech is committed to bridging the gap between education
            and industry. We provide practical training, real-world
            experiences, and career guidance to help students and
            professionals achieve their goals.
          </p>

          <dl className="mt-8 grid grid-cols-3 gap-4">
            {ABOUT_STATS.map((stat) => (
              <div key={stat.label} className="text-left">
                <dt className="sr-only">{stat.label}</dt>
                <dd className="text-lg font-extrabold text-navy dark:text-white sm:text-xl">
                  {stat.value}
                </dd>
                <p className="mt-1 text-xs font-medium text-muted dark:text-slate-400 sm:text-sm">
                  {stat.label}
                </p>
              </div>
            ))}
          </dl>

          <a
            href="#about"
            className={cn(buttonVariants({ variant: "primary" }), "mt-8")}
          >
            Know More About Us
            <span aria-hidden="true">→</span>
          </a>
        </motion.div>
      </div>
    </section>
  );
}
