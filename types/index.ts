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
