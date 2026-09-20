"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2, XCircle } from "lucide-react";
import { motion } from "framer-motion";
import { ApiError, verifyExamAccess } from "@/lib/api";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type AccessState = "verifying" | "error";

export function ExamAccessContent({ token }: { token: string }) {
  const [state, setState] = React.useState<AccessState>("verifying");
  const [message, setMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    async function verify() {
      try {
        const { examLink } = await verifyExamAccess(token);
        // Full-page redirect to the real exam destination — this link only ever works once.
        window.location.assign(examLink);
      } catch (err) {
        setState("error");
        setMessage(
          err instanceof ApiError
            ? err.message
            : "We could not verify this access link. Please contact support."
        );
      }
    }

    void verify();
  }, [token]);

  return (
    <section className="flex min-h-[60vh] items-center justify-center bg-app-bg py-16 dark:bg-dark-bg">
      <div className="container flex justify-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="w-full max-w-md rounded-xl2 border border-slate-100 bg-white p-8 text-center shadow-card-hover dark:border-white/10 dark:bg-dark-surface"
        >
          {state === "verifying" ? (
            <>
              <Loader2
                className="mx-auto h-12 w-12 animate-spin text-primary-blue dark:text-bright-blue"
                aria-hidden="true"
              />
              <h1 className="mt-5 text-xl font-extrabold text-navy dark:text-white">
                Verifying your exam access link...
              </h1>
              <p className="mt-2 text-sm text-muted dark:text-slate-400">
                Please wait, you will be redirected shortly.
              </p>
            </>
          ) : null}

          {state === "error" ? (
            <>
              <XCircle className="mx-auto h-12 w-12 text-red-500" aria-hidden="true" />
              <h1 className="mt-5 text-xl font-extrabold text-navy dark:text-white">
                Access Link Invalid
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-muted dark:text-slate-400">
                {message}
              </p>
              <Link href="/" className={cn(buttonVariants({ variant: "primary" }), "mt-6")}>
                Back to Home
              </Link>
            </>
          ) : null}
        </motion.div>
      </div>
    </section>
  );
}
