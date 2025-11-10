import { Button } from "@/components/ui/button";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import slide1 from "@/assets/slide-1-hook.jpg";
import slide2 from "@/assets/slide-2-solution.jpg";
import slide3 from "@/assets/slide-3-quoting.jpg";
import slide4 from "@/assets/slide-4-cta.jpg";

const slides = [
  {
    image: slide1,
    headline: "You're losing leads after 5pm.",
    subtitle: "We capture, text & book them—automatically.",
    swipe: true,
  },
  {
    image: slide2,
    headline: "Plug-in workflows",
    bullets: ["Lead capture", "SMS/email follow-ups", "Calendars", "Reviews"],
  },
  {
    image: slide3,
    headline: "Tailored quoting systems",
    subtitle: "Your bid structure—just faster.",
  },
  {
    image: slide4,
    headline: "Free Demo",
    subtitle: "Contractors & local service businesses (Tampa Bay)",
    cta: true,
  },
];

export const SlidesCarousel = () => {
  return (
    <div className="w-full max-w-[1080px] mx-auto px-4">
      <Carousel className="w-full">
        <CarouselContent>
          {slides.map((slide, index) => (
            <CarouselItem key={index}>
              <div className="relative aspect-square w-full">
                <img
                  src={slide.image}
                  alt={`Slide ${index + 1}`}
                  className="absolute inset-0 w-full h-full object-cover rounded-2xl"
                />
                <div className="absolute inset-0 flex flex-col justify-center items-center p-[90px] text-center">
                  <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-4 drop-shadow-2xl">
                    {slide.headline}
                  </h2>
                  {slide.subtitle && (
                    <p className="text-xl md:text-2xl text-white/90 mb-6 drop-shadow-lg">
                      {slide.subtitle}
                    </p>
                  )}
                  {slide.bullets && (
                    <ul className="text-lg md:text-xl text-white/90 space-y-2 drop-shadow-lg">
                      {slide.bullets.map((bullet, i) => (
                        <li key={i} className="flex items-center justify-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-violet-glow" />
                          {bullet}
                        </li>
                      ))}
                    </ul>
                  )}
                  {slide.swipe && (
                    <p className="text-lg md:text-xl text-white/80 mt-6 drop-shadow-lg">
                      Swipe →
                    </p>
                  )}
                  {slide.cta && (
                    <div className="space-y-3 mt-6">
                      <Button 
                        size="lg" 
                        className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-8 shadow-lg shadow-primary/20 transition-all hover:shadow-primary/30 text-lg"
                      >
                        DM "DEMO"
                      </Button>
                      <p className="text-sm text-white/70">or Book in bio</p>
                    </div>
                  )}
                </div>
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious className="left-4" />
        <CarouselNext className="right-4" />
      </Carousel>
    </div>
  );
};
