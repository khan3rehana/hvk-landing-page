"use client";

import * as React from "react";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { TESTIMONIALS } from "@/lib/constants";
import { TestimonialCard } from "@/components/home/testimonial-card";
import { cn } from "@/lib/utils";

export function TestimonialsSection() {
  const [autoplay] = React.useState(() =>
    Autoplay({ delay: 5500, stopOnInteraction: false, stopOnMouseEnter: true })
  );
  const [emblaRef, emblaApi] = useEmblaCarousel(
    { loop: true, align: "start" },
    [autoplay]
  );
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const [scrollSnaps, setScrollSnaps] = React.useState<number[]>([]);

  React.useEffect(() => {
    if (!emblaApi) return;
    const updateSnaps = () => setScrollSnaps(emblaApi.scrollSnapList());
    const onSelect = () => setSelectedIndex(emblaApi.selectedScrollSnap());
    updateSnaps();
    onSelect();
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", updateSnaps);
    return () => {
      emblaApi.off("select", onSelect);
      emblaApi.off("reInit", updateSnaps);
    };
  }, [emblaApi]);

  return (
    <section id="testimonials" className="bg-navy py-16 sm:py-20 lg:py-24">
      <div className="container">
        <div className="mx-auto max-w-2xl text-center">
          <div className="flex items-center justify-center gap-3">
            <span className="h-px w-8 bg-bright-blue" aria-hidden="true" />
            <h2 className="text-2xl font-extrabold text-white sm:text-3xl">
              What Our Students Say
            </h2>
            <span className="h-px w-8 bg-bright-blue" aria-hidden="true" />
          </div>
          <p className="mt-3 text-sm leading-relaxed text-white/70 sm:text-base">
            Real stories from our learners who are building successful
            careers with HVK Infotech.
          </p>
        </div>

        <div className="relative mt-12">
          <div className="overflow-hidden" ref={emblaRef}>
            <div className="-ml-6 flex">
              {TESTIMONIALS.map((testimonial) => (
                <div
                  key={testimonial.id}
                  className="min-w-0 flex-[0_0_100%] pl-6 sm:flex-[0_0_50%] lg:flex-[0_0_33.3333%]"
                >
                  <TestimonialCard {...testimonial} />
                </div>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => emblaApi?.scrollPrev()}
            aria-label="Previous testimonial"
            className="absolute -left-3 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:-left-4 sm:flex lg:-left-5"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => emblaApi?.scrollNext()}
            aria-label="Next testimonial"
            className="absolute -right-3 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:-right-4 sm:flex lg:-right-5"
          >
            <ChevronRight className="h-5 w-5" />
          </button>

          <div className="mt-8 flex items-center justify-center gap-2.5">
            {scrollSnaps.map((_, index) => (
              <button
                key={index}
                type="button"
                onClick={() => emblaApi?.scrollTo(index)}
                aria-label={`Go to testimonial group ${index + 1}`}
                aria-current={selectedIndex === index}
                className={cn(
                  "h-2.5 rounded-full transition-all duration-300",
                  selectedIndex === index
                    ? "w-7 bg-bright-blue"
                    : "w-2.5 bg-white/30 hover:bg-white/50"
                )}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
