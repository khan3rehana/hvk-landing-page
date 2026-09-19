"use client";

import * as React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Building2,
  CreditCard,
  GraduationCap,
  Lock,
  Mail,
  MapPinned,
  Phone,
  ShieldCheck,
  User,
} from "lucide-react";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/select";
import { INDIAN_STATES } from "@/lib/constants";
import {
  candidateRegistrationSchema,
  type CandidateRegistrationInput,
} from "@/lib/validations";
import { ApiError, createPaymentLink, registerCandidate } from "@/lib/api";

type RegistrationStatus = "idle" | "registering" | "redirecting" | "error";

const STATUS_LABEL: Record<RegistrationStatus, string> = {
  idle: "Register & Pay Registration Fee",
  registering: "Registering...",
  redirecting: "Redirecting to secure payment...",
  error: "Register & Pay Registration Fee",
};

export function RegistrationForm() {
  const [status, setStatus] = React.useState<RegistrationStatus>("idle");
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<CandidateRegistrationInput>({
    resolver: zodResolver(candidateRegistrationSchema),
    defaultValues: {
      fullName: "",
      email: "",
      contactNumber: "",
      college: "",
      place: "",
      city: "",
      state: "",
      pincode: "",
    },
  });

  async function onSubmit(data: CandidateRegistrationInput) {
    setErrorMessage(null);
    setStatus("registering");
    try {
      const { candidateId } = await registerCandidate({
        name: data.fullName,
        email: data.email,
        phone: data.contactNumber,
        college: data.college,
        place: data.place,
        city: data.city,
        state: data.state,
        pincode: data.pincode,
      });

      setStatus("redirecting");
      const { paymentLinkUrl } = await createPaymentLink(candidateId);

      // Full-page redirect to Razorpay's hosted checkout — the frontend never loads
      // Razorpay's SDK or sees a Razorpay key. Razorpay redirects back to
      // /registration/callback once the customer finishes paying.
      window.location.assign(paymentLinkUrl);
    } catch (err) {
      setStatus("error");
      setErrorMessage(
        err instanceof ApiError ? err.message : "Something went wrong. Please try again."
      );
    }
  }

  const isBusy = status === "registering" || status === "redirecting";

  return (
    <section id="registration" className="relative bg-app-bg py-14 dark:bg-dark-bg sm:py-16 lg:py-20">

      <div className="container">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="relative rounded-xl2 border border-slate-100 bg-white p-6 shadow-card-hover dark:border-white/10 dark:bg-dark-surface sm:p-8 lg:p-10"
        >
          <div className="hidden items-center gap-3 rounded-full border border-light-blue bg-white py-2 pl-3 pr-4 shadow-card-hover dark:border-white/10 dark:bg-dark-surface-alt sm:absolute sm:-top-5 sm:right-8 sm:flex lg:-top-6 lg:right-10">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-light-blue text-primary-blue dark:bg-bright-blue/10 dark:text-bright-blue">
              <ShieldCheck className="h-4.5 w-4.5" aria-hidden="true" />
            </span>
            <span className="leading-tight">
              <span className="block text-xs font-bold text-navy dark:text-white">
                Secure Your Seat
              </span>
              <span className="block text-[11px] text-muted dark:text-slate-400">
                Limited Seats Available. Register Now!
              </span>
            </span>
          </div>

          <div>
            <span className="text-xs font-bold uppercase tracking-[0.15em] text-primary-blue dark:text-bright-blue">
              Get Started Today
            </span>
            <h2 className="mt-2 text-2xl font-extrabold text-navy dark:text-white sm:text-3xl">
              Candidate Registration
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted dark:text-slate-400">
              Fill in your details to register for our programs and take the
              first step towards a brighter future with HVK Infotech.
            </p>

            <div className="mt-4 flex items-center gap-3 rounded-full border border-light-blue bg-light-blue/40 py-2 pl-3 pr-4 dark:border-white/10 dark:bg-dark-surface-alt sm:hidden">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-primary-blue dark:bg-bright-blue/10 dark:text-bright-blue">
                <ShieldCheck className="h-4.5 w-4.5" aria-hidden="true" />
              </span>
              <span className="leading-tight">
                <span className="block text-xs font-bold text-navy dark:text-white">
                  Secure Your Seat
                </span>
                <span className="block text-[11px] text-muted dark:text-slate-400">
                  Limited Seats Available. Register Now!
                </span>
              </span>
            </div>

            <form
              onSubmit={handleSubmit(onSubmit)}
              className="mt-6 space-y-5"
              noValidate
            >
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label htmlFor="fullName" className="mb-1.5 block text-sm font-semibold text-ink dark:text-slate-200">
                    Full Name <span className="text-red-500">*</span>
                  </label>
                  <Input
                    id="fullName"
                    icon={User}
                    placeholder="Enter your full name"
                    error={errors.fullName?.message}
                    {...register("fullName")}
                  />
                </div>
                <div>
                  <label htmlFor="email" className="mb-1.5 block text-sm font-semibold text-ink dark:text-slate-200">
                    Email Address <span className="text-red-500">*</span>
                  </label>
                  <Input
                    id="email"
                    type="email"
                    icon={Mail}
                    placeholder="Enter your email address"
                    error={errors.email?.message}
                    {...register("email")}
                  />
                </div>
                <div>
                  <label htmlFor="contactNumber" className="mb-1.5 block text-sm font-semibold text-ink dark:text-slate-200">
                    Contact Number <span className="text-red-500">*</span>
                  </label>
                  <Input
                    id="contactNumber"
                    type="tel"
                    inputMode="numeric"
                    icon={Phone}
                    placeholder="Enter 10 digit mobile number"
                    maxLength={10}
                    error={errors.contactNumber?.message}
                    {...register("contactNumber")}
                  />
                </div>
                <div>
                  <label htmlFor="college" className="mb-1.5 block text-sm font-semibold text-ink dark:text-slate-200">
                    College / University <span className="text-red-500">*</span>
                  </label>
                  <Input
                    id="college"
                    icon={GraduationCap}
                    placeholder="Enter your college name"
                    error={errors.college?.message}
                    {...register("college")}
                  />
                </div>
                <div>
                  <label htmlFor="place" className="mb-1.5 block text-sm font-semibold text-ink dark:text-slate-200">
                    Place / Locality <span className="text-red-500">*</span>
                  </label>
                  <Input
                    id="place"
                    icon={MapPinned}
                    placeholder="Enter your area or locality"
                    error={errors.place?.message}
                    {...register("place")}
                  />
                </div>
                <div>
                  <label htmlFor="city" className="mb-1.5 block text-sm font-semibold text-ink dark:text-slate-200">
                    City <span className="text-red-500">*</span>
                  </label>
                  <Input
                    id="city"
                    icon={Building2}
                    placeholder="Enter your city"
                    error={errors.city?.message}
                    {...register("city")}
                  />
                </div>
                <div>
                  <label htmlFor="state" className="mb-1.5 block text-sm font-semibold text-ink dark:text-slate-200">
                    State <span className="text-red-500">*</span>
                  </label>
                  <Controller
                    control={control}
                    name="state"
                    render={({ field }) => (
                      <SearchableSelect
                        id="state"
                        name={field.name}
                        options={INDIAN_STATES}
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        placeholder="Select state"
                        error={errors.state?.message}
                      />
                    )}
                  />
                </div>
                <div>
                  <label htmlFor="pincode" className="mb-1.5 block text-sm font-semibold text-ink dark:text-slate-200">
                    Pincode <span className="text-red-500">*</span>
                  </label>
                  <Input
                    id="pincode"
                    type="text"
                    inputMode="numeric"
                    icon={Lock}
                    placeholder="Enter 6 digit pincode"
                    maxLength={6}
                    error={errors.pincode?.message}
                    {...register("pincode")}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isBusy}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-bright-blue px-6 py-4 text-sm font-bold text-white shadow-sm transition-colors hover:bg-primary-blue disabled:cursor-not-allowed disabled:opacity-70"
              >
                <CreditCard className="h-4 w-4" aria-hidden="true" />
                {STATUS_LABEL[status]}
                <span aria-hidden="true">→</span>
              </button>

              <p className="flex items-center justify-center gap-1.5 text-xs text-muted dark:text-slate-400">
                <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                Your information is safe and secure with us.
              </p>

              <div role="status" aria-live="polite" className="text-center text-sm">
                {status === "error" && errorMessage ? (
                  <p className="font-semibold text-red-500 dark:text-red-400">
                    {errorMessage}
                  </p>
                ) : null}
              </div>
            </form>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
