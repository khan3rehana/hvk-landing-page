"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { motion } from "framer-motion";
import { ApiError, verifyPaymentLink } from "@/lib/api";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type CallbackState = "verifying" | "success" | "error" | "invalid";

export function CallbackContent() {
  const searchParams = useSearchParams();
  const [state, setState] = React.useState<CallbackState>("verifying");
  const [message, setMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    const razorpayPaymentId = searchParams.get("razorpay_payment_id");
    const razorpayPaymentLinkId = searchParams.get("razorpay_payment_link_id");
    const razorpayPaymentLinkReferenceId = searchParams.get(
      "razorpay_payment_link_reference_id"
    );
    const razorpayPaymentLinkStatus = searchParams.get(
      "razorpay_payment_link_status"
    );
    const razorpaySignature = searchParams.get("razorpay_signature");

    if (
      !razorpayPaymentId ||
      !razorpayPaymentLinkId ||
      !razorpayPaymentLinkReferenceId ||
      !razorpayPaymentLinkStatus ||
      !razorpaySignature
    ) {
      const markInvalid = () => setState("invalid");
      markInvalid();
      return;
    }

    async function verify() {
      try {
        await verifyPaymentLink({
          candidateId: razorpayPaymentLinkReferenceId!,
          razorpay_payment_id: razorpayPaymentId!,
          razorpay_payment_link_id: razorpayPaymentLinkId!,
          razorpay_payment_link_reference_id: razorpayPaymentLinkReferenceId!,
          razorpay_payment_link_status: razorpayPaymentLinkStatus!,
          razorpay_signature: razorpaySignature!,
        });
        setState("success");
      } catch (err) {
        setState("error");
        setMessage(
          err instanceof ApiError
            ? err.message
            : "We could not confirm your payment. Please contact support."
        );
      }
    }

    void verify();
  }, [searchParams]);

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
                Verifying your payment...
              </h1>
              <p className="mt-2 text-sm text-muted dark:text-slate-400">
                Please wait, this only takes a moment.
              </p>
            </>
          ) : null}

          {state === "success" ? (
            <>
              <CheckCircle2
                className="mx-auto h-12 w-12 text-green-500"
                aria-hidden="true"
              />
              <h1 className="mt-5 text-xl font-extrabold text-navy dark:text-white">
                Registration Complete!
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-muted dark:text-slate-400">
                Payment received. Check your email for your registration
                confirmation and exam access details.
              </p>
              <Link
                href="/"
                className={cn(buttonVariants({ variant: "primary" }), "mt-6")}
              >
                Back to Home
              </Link>
            </>
          ) : null}

          {(state === "error" || state === "invalid") ? (
            <>
              <XCircle className="mx-auto h-12 w-12 text-red-500" aria-hidden="true" />
              <h1 className="mt-5 text-xl font-extrabold text-navy dark:text-white">
                {state === "invalid" ? "Payment Not Confirmed" : "Verification Failed"}
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-muted dark:text-slate-400">
                {state === "invalid"
                  ? "We couldn't find payment details for this page. If you completed a payment, please contact support with your registered email."
                  : message}
              </p>
              <Link
                href="/#registration"
                className={cn(buttonVariants({ variant: "primary" }), "mt-6")}
              >
                Back to Registration
              </Link>
            </>
          ) : null}
        </motion.div>
      </div>
    </section>
  );
}
