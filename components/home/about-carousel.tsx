"use client";

import * as React from "react";
import Image from "next/image";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ABOUT_IMAGES } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function AboutCarousel() {
  const [autoplay] = React.useState(() =>
    Autoplay({ delay: 4500, stopOnInteraction: false, stopOnMouseEnter: true })
  );
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true }, [autoplay]);
  const [selectedIndex, setSelectedIndex] = React.useState(0);

  React.useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setSelectedIndex(emblaApi.selectedScrollSnap());
    emblaApi.on("select", onSelect);
    onSelect();
    return () => {
      emblaApi.off("select", onSelect);
    };
  }, [emblaApi]);

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label="HVK Infotech office and team photos"
      className="relative aspect-[4/3] overflow-hidden rounded-xl2 shadow-card-hover"
    >
      <div className="embla h-full" ref={emblaRef}>
        <div className="flex h-full">
          {ABOUT_IMAGES.map((image, index) => (
            <div
              key={image}
              className="relative h-full min-w-0 flex-[0_0_100%]"
              role="group"
              aria-roledescription="slide"
              aria-label={`${index + 1} of ${ABOUT_IMAGES.length}`}
              aria-hidden={selectedIndex !== index}
            >
              <Image
                src={image}
                alt="HVK Infotech office and team collaborating"
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                priority={index === 0}
                className="object-cover"
              />
            </div>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={() => emblaApi?.scrollPrev()}
        aria-label="Previous photo"
        className="absolute left-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-navy backdrop-blur-sm transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bright-blue"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => emblaApi?.scrollNext()}
        aria-label="Next photo"
        className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-navy backdrop-blur-sm transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bright-blue"
      >
        <ChevronRight className="h-4 w-4" />
      </button>

      <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2">
        {ABOUT_IMAGES.map((image, index) => (
          <button
            key={image}
            type="button"
            onClick={() => emblaApi?.scrollTo(index)}
            aria-label={`Go to photo ${index + 1}`}
            aria-current={selectedIndex === index}
            className={cn(
              "h-2 rounded-full transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
              selectedIndex === index ? "w-6 bg-white" : "w-2 bg-white/60 hover:bg-white/90"
            )}
          />
        ))}
      </div>
    </div>
  );
}
