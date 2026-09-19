"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";
import { HERO_SLIDES } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function HeroCarousel() {
  const [autoplay] = React.useState(() =>
    Autoplay({ delay: 5000, stopOnInteraction: false, stopOnMouseEnter: false })
  );
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true }, [autoplay]);
  const [selectedIndex, setSelectedIndex] = React.useState(0);

  const scrollTo = React.useCallback(
    (index: number) => emblaApi?.scrollTo(index),
    [emblaApi]
  );
  const scrollPrev = React.useCallback(
    () => emblaApi?.scrollPrev(),
    [emblaApi]
  );
  const scrollNext = React.useCallback(
    () => emblaApi?.scrollNext(),
    [emblaApi]
  );

  React.useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setSelectedIndex(emblaApi.selectedScrollSnap());
    emblaApi.on("select", onSelect);
    onSelect();
    return () => {
      emblaApi.off("select", onSelect);
    };
  }, [emblaApi]);

  React.useEffect(() => {
    function handleVisibilityChange() {
      if (document.hidden) {
        autoplay.stop();
      } else {
        autoplay.play();
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [autoplay]);

  return (
    <section
      role="region"
      aria-roledescription="carousel"
      aria-label="Featured highlights"
      className="relative w-full overflow-hidden bg-app-bg dark:bg-navy"
    >
      <div className="embla" ref={emblaRef}>
        <div className="flex">
          {HERO_SLIDES.map((slide, index) => (
            <div
              key={slide.id}
              className="relative min-h-[520px] w-full min-w-0 flex-[0_0_100%] sm:min-h-[560px] lg:min-h-[620px]"
              role="group"
              aria-roledescription="slide"
              aria-label={`${index + 1} of ${HERO_SLIDES.length}`}
              aria-hidden={selectedIndex !== index}
            >
              <Image
                src={slide.image}
                alt=""
                fill
                priority={index === 0}
                sizes="100vw"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-navy/90 via-navy/70 to-navy/30" />

              <div className="container relative flex h-full min-h-[520px] items-center sm:min-h-[560px] lg:min-h-[620px]">
                <motion.div
                  initial={{ opacity: 0, y: 24 }}
                  animate={
                    selectedIndex === index
                      ? { opacity: 1, y: 0 }
                      : { opacity: 0, y: 24 }
                  }
                  transition={{ duration: 0.6, ease: "easeOut" }}
                  className="max-w-2xl py-20"
                >
                  <span className="text-xs font-bold uppercase tracking-[0.2em] text-bright-blue">
                    {slide.eyebrow}
                  </span>
                  <h1 className="mt-4 text-4xl font-extrabold leading-tight text-white sm:text-5xl lg:text-6xl">
                    {slide.headingLines.map((line, lineIndex) => (
                      <span key={lineIndex} className="block">
                        {line.split(slide.highlightWord).map((part, partIndex, arr) => (
                          <React.Fragment key={partIndex}>
                            {part}
                            {partIndex < arr.length - 1 ? (
                              <span className="text-bright-blue">
                                {slide.highlightWord}
                              </span>
                            ) : null}
                          </React.Fragment>
                        ))}
                      </span>
                    ))}
                  </h1>
                  <p className="mt-4 text-lg font-semibold text-white/90">
                    {slide.subheading}
                  </p>
                  <p className="mt-4 max-w-xl text-base leading-relaxed text-white/75">
                    {slide.description}
                  </p>
                  <Link
                    href={slide.ctaHref}
                    className="mt-8 inline-flex items-center gap-2 rounded-lg bg-bright-blue px-6 py-3.5 text-sm font-semibold text-white shadow-lg transition-colors hover:bg-primary-blue"
                  >
                    {slide.ctaLabel}
                    <span aria-hidden="true">→</span>
                  </Link>
                </motion.div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={scrollPrev}
        aria-label="Previous slide"
        className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-sm transition-colors hover:bg-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:left-6"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={scrollNext}
        aria-label="Next slide"
        className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-sm transition-colors hover:bg-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:right-6"
      >
        <ChevronRight className="h-5 w-5" />
      </button>

      <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-2.5">
        {HERO_SLIDES.map((slide, index) => (
          <button
            key={slide.id}
            type="button"
            onClick={() => scrollTo(index)}
            aria-label={`Go to slide ${index + 1}`}
            aria-current={selectedIndex === index}
            className={cn(
              "h-2.5 rounded-full transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
              selectedIndex === index ? "w-7 bg-bright-blue" : "w-2.5 bg-white/50 hover:bg-white/80"
            )}
          />
        ))}
      </div>
    </section>
  );
}
