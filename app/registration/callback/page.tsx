import { Suspense } from "react";
import type { Metadata } from "next";
import { Loader2 } from "lucide-react";
import { CallbackContent } from "./callback-content";

export const metadata: Metadata = {
  title: "Payment Status | HVK Infotech",
  robots: { index: false, follow: false },
};

function CallbackFallback() {
  return (
    <section className="flex min-h-[60vh] items-center justify-center bg-app-bg py-16 dark:bg-dark-bg">
      <Loader2
        className="h-10 w-10 animate-spin text-primary-blue dark:text-bright-blue"
        aria-hidden="true"
      />
    </section>
  );
}

export default function RegistrationCallbackPage() {
  return (
    <Suspense fallback={<CallbackFallback />}>
      <CallbackContent />
    </Suspense>
  );
}
