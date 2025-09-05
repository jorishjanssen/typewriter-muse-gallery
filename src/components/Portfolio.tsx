import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import photo1 from '@/assets/photo1.jpg';
import photo2 from '@/assets/photo2.jpg';
import photo3 from '@/assets/photo3.jpg';
import photo4 from '@/assets/photo4.jpg';

interface PortfolioItem {
  image: string;
  quote: string;
  author?: string;
}

const portfolioItems: PortfolioItem[] = [
  {
    image: photo1,
    quote: "The mountains are calling and I must go.",
    author: "John Muir"
  },
  {
    image: photo2,
    quote: "In every walk with nature, one receives far more than they seek.",
    author: "John Muir"
  },
  {
    image: photo3,
    quote: "The eyes are the window to the soul.",
    author: "Traditional Proverb"
  },
  {
    image: photo4,
    quote: "Light makes photography. Embrace light. Admire it. Love it."
  }
];

export const Portfolio = () => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const goToNext = () => {
    if (isTransitioning) return;
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % portfolioItems.length);
      setIsTransitioning(false);
    }, 150);
  };

  const goToPrevious = () => {
    if (isTransitioning) return;
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentIndex((prev) => (prev - 1 + portfolioItems.length) % portfolioItems.length);
      setIsTransitioning(false);
    }, 150);
  };

  const currentItem = portfolioItems[currentIndex];

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-6xl w-full mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
          {/* Image Section */}
          <div className="relative order-2 lg:order-1">
            <div 
              className={`relative overflow-hidden rounded-sm shadow-2xl transition-all duration-300 ${
                isTransitioning ? 'opacity-50 scale-95' : 'opacity-100 scale-100'
              }`}
            >
              <img
                src={currentItem.image}
                alt={`Portfolio image ${currentIndex + 1}`}
                className="w-full h-[400px] lg:h-[600px] object-cover"
              />
              <div className="absolute inset-0 bg-vintage-sepia/10 mix-blend-multiply" />
            </div>
            
            {/* Navigation Arrows */}
            <Button
              variant="ghost"
              size="icon"
              onClick={goToPrevious}
              className="absolute left-4 top-1/2 -translate-y-1/2 bg-background/80 hover:bg-background text-foreground border border-border/50 rounded-sm h-12 w-12 shadow-lg"
            >
              <ChevronLeft className="w-6 h-6" />
            </Button>
            
            <Button
              variant="ghost"
              size="icon"
              onClick={goToNext}
              className="absolute right-4 top-1/2 -translate-y-1/2 bg-background/80 hover:bg-background text-foreground border border-border/50 rounded-sm h-12 w-12 shadow-lg"
            >
              <ChevronRight className="w-6 h-6" />
            </Button>
          </div>

          {/* Quote Section */}
          <div className="order-1 lg:order-2 text-center lg:text-left">
            <div 
              className={`transition-all duration-300 ${
                isTransitioning ? 'opacity-50 translate-y-4' : 'opacity-100 translate-y-0'
              }`}
            >
              <blockquote className="font-typewriter text-xl lg:text-2xl leading-relaxed text-foreground mb-6 lg:mb-8">
                "{currentItem.quote}"
              </blockquote>
              
              {currentItem.author && (
                <cite className="font-typewriter text-sm lg:text-base text-muted-foreground uppercase tracking-wider">
                  — {currentItem.author}
                </cite>
              )}
              
              {/* Image Counter */}
              <div className="mt-8 lg:mt-12 flex items-center justify-center lg:justify-start space-x-2">
                <span className="font-typewriter text-sm text-muted-foreground">
                  {String(currentIndex + 1).padStart(2, '0')}
                </span>
                <div className="h-px bg-border w-8" />
                <span className="font-typewriter text-sm text-muted-foreground">
                  {String(portfolioItems.length).padStart(2, '0')}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Dots */}
        <div className="flex justify-center mt-8 lg:mt-12 space-x-3">
          {portfolioItems.map((_, index) => (
            <button
              key={index}
              onClick={() => {
                if (isTransitioning) return;
                setIsTransitioning(true);
                setTimeout(() => {
                  setCurrentIndex(index);
                  setIsTransitioning(false);
                }, 150);
              }}
              className={`w-2 h-2 rounded-full transition-all duration-300 ${
                index === currentIndex 
                  ? 'bg-foreground scale-125' 
                  : 'bg-muted-foreground/40 hover:bg-muted-foreground/60'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
};