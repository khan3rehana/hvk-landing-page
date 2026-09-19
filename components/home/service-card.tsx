"use client";

import { motion } from "framer-motion";
import type { ServiceItem } from "@/types";

export function ServiceCard({ icon: Icon, title, description }: ServiceItem) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="group flex h-full flex-col items-center rounded-xl2 border border-slate-100 bg-white p-6 text-center shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-card-hover dark:border-white/10 dark:bg-dark-surface"
    >
      <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-light-blue text-primary-blue transition-colors duration-300 group-hover:bg-bright-blue group-hover:text-white dark:bg-bright-blue/10 dark:text-bright-blue">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </span>
      <h3 className="mt-4 text-base font-bold text-navy dark:text-white">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted dark:text-slate-400">{description}</p>
    </motion.div>
  );
}
