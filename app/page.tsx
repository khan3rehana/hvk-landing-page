import { HeroCarousel } from "@/components/home/hero-carousel";
import { RegistrationForm } from "@/components/home/registration-form";
import { ServicesSection } from "@/components/home/services-section";
import { AboutSection } from "@/components/home/about-section";
import { TestimonialsSection } from "@/components/home/testimonials-section";
import { CtaSection } from "@/components/home/cta-section";

export default function HomePage() {
  return (
    <>
      <HeroCarousel />
      <RegistrationForm />
      <ServicesSection />
      <AboutSection />
      <TestimonialsSection />
      <CtaSection />
    </>
  );
}
