import {
  GraduationCap,
  Code2,
  Briefcase,
  Users,
  Lightbulb,
  Settings,
  Linkedin,
  Instagram,
  Youtube,
  Facebook,
} from "lucide-react";
import type {
  HeroSlide,
  ServiceItem,
  TestimonialItem,
  NavLink,
  FooterLinkGroupData,
  SocialLink,
  StatItem,
} from "@/types";

export const SITE_NAME = "HVK Infotech";
export const SITE_TAGLINE = "Innovate | Build | Grow";
export const PHONE_NUMBER = "+91 98765 43210";
export const PHONE_NUMBER_HREF = "tel:+919876543210";
export const CONTACT_EMAIL = "info@hvkinfotech.com";
export const OFFICE_LOCATION = "Lucknow, Uttar Pradesh, India";
export const WORKING_HOURS = "Mon - Sat: 9:00 AM - 6:00 PM";

export const ABOUT_IMAGES: string[] = [
  "/images/about/office.jpg",
  "/images/about/team-1.jpg",
  "/images/about/team-2.jpg",
];

export const NAV_LINKS: NavLink[] = [
  { label: "Home", href: "/" },
  { label: "About", href: "#about" },
  { label: "Services", href: "#services" },
  { label: "Events", href: "#events" },
  { label: "Testimonials", href: "#testimonials" },
  { label: "Contact", href: "#contact" },
];

export const SOCIAL_LINKS: SocialLink[] = [
  { label: "LinkedIn", href: "https://linkedin.com", icon: Linkedin },
  { label: "Instagram", href: "https://instagram.com", icon: Instagram },
  { label: "YouTube", href: "https://youtube.com", icon: Youtube },
  { label: "Facebook", href: "https://facebook.com", icon: Facebook },
];

export const HERO_SLIDES: HeroSlide[] = [
  {
    id: "slide-1",
    eyebrow: "HVK INFOTECH",
    headingLines: ["Shape Your Future with", "HVK Infotech"],
    highlightWord: "Infotech",
    subheading: "Learn · Build · Grow · Succeed",
    description:
      "Practical learning, real-world projects and career opportunities to help you become industry ready.",
    ctaLabel: "Explore Opportunities",
    ctaHref: "#services",
    image: "/images/hero/hero-1.jpg",
  },
  {
    id: "slide-2",
    eyebrow: "HVK INFOTECH",
    headingLines: ["Build Skills That", "Matter"],
    highlightWord: "Matter",
    subheading: "Practical · Hands-on · Industry-Ready",
    description:
      "Gain practical learning and real-world project experience designed by industry experts to accelerate your career.",
    ctaLabel: "Explore Programs",
    ctaHref: "#services",
    image: "/images/hero/hero-2.jpg",
  },
  {
    id: "slide-3",
    eyebrow: "HVK INFOTECH",
    headingLines: ["Start Your Career", "Journey"],
    highlightWord: "Journey",
    subheading: "Internships · Placements · Mentorship",
    description:
      "Get access to internships, dedicated placement support and career guidance from experienced mentors.",
    ctaLabel: "Register Now",
    ctaHref: "#registration",
    image: "/images/hero/hero-3.jpg",
  },
];

export const SERVICES: ServiceItem[] = [
  {
    id: "training-certification",
    icon: GraduationCap,
    title: "Training & Certification",
    description: "Industry-focused programs with certification.",
  },
  {
    id: "internship-programs",
    icon: Code2,
    title: "Internship Programs",
    description: "Gain real-world experience with live projects.",
  },
  {
    id: "placement-assistance",
    icon: Briefcase,
    title: "Placement Assistance",
    description: "Connect with top companies and opportunities.",
  },
  {
    id: "career-guidance",
    icon: Users,
    title: "Career Guidance",
    description: "Expert mentorship for a brighter career path.",
  },
  {
    id: "workshops-events",
    icon: Lightbulb,
    title: "Workshops & Events",
    description: "Learn from industry experts and expand your network.",
  },
  {
    id: "custom-solutions",
    icon: Settings,
    title: "Custom Solutions",
    description: "Tailored training for colleges and organizations.",
  },
];

export const ABOUT_STATS: StatItem[] = [
  { value: "Industry", label: "Expert Trainers" },
  { value: "1000+", label: "Students Trained" },
  { value: "95%", label: "Placement Support" },
];

export const TESTIMONIALS: TestimonialItem[] = [
  {
    id: "aarav-sharma",
    name: "Aarav Sharma",
    education: "B.Tech, Lucknow University",
    rating: 5,
    quote:
      "HVK Infotech provided amazing practical training and placement support. The mentors were very helpful and always guide you in the right direction.",
    avatar: "/images/testimonials/aarav-sharma.jpg",
  },
  {
    id: "priya-verma",
    name: "Priya Verma",
    education: "BCA, Delhi University",
    rating: 5,
    quote:
      "The internship program at HVK Infotech helped me gain real-world experience. Highly recommended for anyone serious about their career.",
    avatar: "/images/testimonials/priya-verma.jpg",
  },
  {
    id: "rohit-singh",
    name: "Rohit Singh",
    education: "MCA, AKTU",
    rating: 5,
    quote:
      "Great learning environment, supportive team, and excellent placement assistance. HVK Infotech truly cares about its students.",
    avatar: "/images/testimonials/rohit-singh.jpg",
  },
  {
    id: "sneha-gupta",
    name: "Sneha Gupta",
    education: "B.Sc IT, Mumbai University",
    rating: 5,
    quote:
      "The workshops and hands-on sessions gave me confidence to face real interviews. HVK Infotech's guidance made all the difference.",
    avatar: "/images/testimonials/sneha-gupta.jpg",
  },
];

export const QUICK_LINKS: NavLink[] = [
  { label: "Home", href: "/" },
  { label: "About Us", href: "#about" },
  { label: "Services", href: "#services" },
  { label: "Events", href: "#events" },
  { label: "Testimonials", href: "#testimonials" },
  { label: "Contact", href: "#contact" },
];

export const FOOTER_SERVICE_LINKS: NavLink[] = SERVICES.map((service) => ({
  label: service.title,
  href: `#services`,
}));

export const FOOTER_LINK_GROUPS: FooterLinkGroupData[] = [
  { title: "Quick Links", links: QUICK_LINKS },
  { title: "Our Services", links: FOOTER_SERVICE_LINKS },
];

export const INDIAN_STATES: string[] = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
  "Delhi (NCT)",
  "Jammu and Kashmir",
  "Ladakh",
  "Chandigarh",
  "Puducherry",
];
