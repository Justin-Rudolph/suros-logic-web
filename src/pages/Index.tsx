import { Button } from "@/components/ui/button";
import cardImage from "@/assets/aa-card.png";

const Index = () => {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Hero Section */}
      <section className="flex-1 flex items-center justify-center px-4 py-20">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-12 items-center">
          {/* Badge Showcase */}
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-violet-glow/20 to-cyan-glow/20 blur-3xl rounded-full" />
            <div className="relative bg-card border border-border rounded-2xl p-8 backdrop-blur-sm">
              <img 
                src={cardImage} 
                alt="Astute Automation Business Card" 
                className="w-full h-auto rounded-lg shadow-2xl"
              />
            </div>
          </div>

          {/* Content */}
          <div className="space-y-6">
            <div className="inline-block">
              <span className="text-sm font-mono text-secondary uppercase tracking-wider px-3 py-1 bg-secondary/10 rounded-full border border-secondary/20">
                Premium Quality
              </span>
            </div>
            
            <h1 className="text-5xl md:text-6xl font-bold leading-tight">
              <span className="bg-gradient-to-r from-violet-glow to-cyan-glow bg-clip-text text-transparent">
                Astute
              </span>
              <br />
              <span className="text-foreground">Automation</span>
            </h1>
            
            <p className="text-lg text-muted-foreground leading-relaxed">
              Premium matte-black business cards with violet foil-stamped monograms. 
              Authentic 35mm film aesthetic featuring anisotropic reflections and 
              precise PCB-trace details for sophisticated branding.
            </p>

            <div className="flex gap-4 pt-4">
              <Button 
                size="lg" 
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-8 shadow-lg shadow-primary/20 transition-all hover:shadow-primary/30"
              >
                Learn More
              </Button>
              <Button 
                size="lg" 
                variant="outline" 
                className="border-border hover:bg-accent/50 font-semibold px-8"
              >
                Contact Us
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="border-t border-border bg-card/30 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 py-16">
          <div className="grid md:grid-cols-3 gap-8">
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20">
                <svg className="w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-foreground">Precision Engineering</h3>
              <p className="text-muted-foreground">
                Foil-stamped monograms with hairline PCB traces and anisotropic reflections.
              </p>
            </div>

            <div className="space-y-3">
              <div className="w-12 h-12 rounded-lg bg-secondary/10 flex items-center justify-center border border-secondary/20">
                <svg className="w-6 h-6 text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-foreground">Film Aesthetic</h3>
              <p className="text-muted-foreground">
                Authentic 35mm film grain with natural lens characteristics and contact shadows.
              </p>
            </div>

            <div className="space-y-3">
              <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center border border-accent/20">
                <svg className="w-6 h-6 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-foreground">Premium Materials</h3>
              <p className="text-muted-foreground">
                Matte-black cards with micro edge wear and subtle violet-blue edge lighting.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Index;
