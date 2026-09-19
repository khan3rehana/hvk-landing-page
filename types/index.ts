import type { LucideIcon } from "lucide-react";

export interface HeroSlide {
  id: string;
  eyebrow: string;
  headingLines: string[];
  highlightWord: string;
  subheading: string;
  description: string;
  ctaLabel: string;
  ctaHref: string;
  image: string;
}

export interface ServiceItem {
  id: string;
  icon: LucideIcon;
  title: string;
  description: string;
}

export interface TestimonialItem {
  id: string;
  name: string;
  education: string;
  rating: number;
  quote: string;
  avatar: string;
}

export interface NavLink {
  label: string;
  href: string;
}

export interface FooterLinkGroupData {
  title: string;
  links: NavLink[];
}

export interface SocialLink {
  label: string;
  href: string;
  icon: LucideIcon;
}

export interface StatItem {
  value: string;
  label: string;
}

export interface CandidateRegistration {
  fullName: string;
  email: string;
  contactNumber: string;
  college: string;
  place: string;
  city: string;
  state: string;
  pincode: string;
}

/** Envelope every hvk-backend endpoint responds with. */
export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

export interface RegisterCandidateData {
  candidateId: string;
}

export interface CreateOrderData {
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
  candidateName: string;
  candidateEmail: string;
  candidatePhone: string;
}

export interface VerifyPaymentData {
  status: "paid";
  candidateId: string;
  emailSent: boolean;
}
