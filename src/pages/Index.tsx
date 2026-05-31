import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight, Check, Loader2, ChevronLeft, ChevronRight, Star, Phone, Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import demoVideoThumbnail from "@/assets/demo_video_thumbnail.png";
import surosLogo from "@/assets/suros-logo-new.png";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { getFunctionsBaseUrl } from "@/lib/functionsApi";
import { isProtectedDevHost } from "@/lib/devAccess";

const BID_FORM_VIDEO_URL =
  "https://firebasestorage.googleapis.com/v0/b/suros-logic.firebasestorage.app/o/Suros%20Logic%20Demo%20-%205.30.26.mp4?alt=media&token=a592d11b-0e67-4a0b-9b89-33f910e5ddcf";
const PLAN_ANALYZER_VIDEO_URL = 
  "https://firebasestorage.googleapis.com/v0/b/suros-logic.firebasestorage.app/o/Plan_Analyzer_User_Guide.mp4?alt=media&token=83239a41-928d-47fc-af77-3bbda2ee2fcd";
const LANDING_CHECKOUT_SOURCE = "landing_quickstart";
const TRIAL_DIALOG_DRAFT_STORAGE_KEY = "suros-logic-trial-dialog-draft";

const TESTIMONIALS = [
  {
    name: "Nate",
    photo: "/nate.png",
    company: "Seagulf Painting",
    quote:
      "Honestly, Suros has been a game changer for us. The system saves us a ridiculous amount of time on estimates and keeping jobs organized. What we like most is that it actually feels like it was built by people in construction, not just software guys. The team behind it has been awesome to work with and they're constantly making the platform better.",
    stars: 5,
  },
  {
    name: "Dennis",
    photo: "/dennis.jpg",
    company: "Last Call Home Solutions",
    quote:
      "Suros Logic Systems has made our workflow way smoother. We can throw rough notes into the system and it turns them into clean, professional bids fast. It's saved us hours every week already. Caleb and the team genuinely care about contractors and you can tell by the way the system is built.",
    stars: 5,
  },
  {
    name: "Barak",
    photo: "/barak.png",
    company: "ACI Stucco & Stone",
    quote:
      "We've tried other estimating software before and nothing really felt built for actual contractors until Suros. The plan analyzer alone has been a huge time saver — we upload the drawings and it pulls out the scopes, flags conflicts, and gives us a head start on the bid instead of starting from scratch. The proposals come out clean and professional without taking forever to put together.",
    stars: 5,
  },
  {
    name: "Albert",
    photo: "/albert.jpg",
    company: "Elite Walls And Ceilings",
    quote:
      "What impressed us most about Suros is how simple and useful it is. It cuts down a ton of admin work and helps keep projects organized without overcomplicating everything. The team behind it is solid too — they actually listen to feedback and keep improving the platform.",
    stars: 5,
  },
  {
    name: "Alex",
    photo: "/alex.jpg",
    company: "Mazas Development",
    quote:
      "Suros changed how we run jobs from start to finish. Before, bids and change orders lived in completely different places — emails, spreadsheets, random folders. Now everything is in one workspace and the whole team knows exactly where to look. The AI does the heavy lifting on the writing and we just review and send. It's the kind of tool you didn't know you needed until you can't imagine working without it.",
    stars: 5,
  },
];

const CLIENT_LOGOS = [
  { name: "Seagulf Painting", src: "/seagulf_logo.avif" },
  { name: "Last Call Home Solutions", src: "/last_call_logo.png" },
  { name: "ACI Stucco & Stone", src: "/aci_logo.png" },
  { name: "Elite Walls And Ceilings", src: "/elite_walls_logo.png" },
  { name: "Mazas Development", src: "/mazas_devlopment.png" },
];

const ScreenshotPlaceholder = ({
  label,
  src,
  className = "",
  onClick,
}: {
  label: string;
  src?: string;
  className?: string;
  onClick?: () => void;
}) => (
  <div className={`relative group ${className}`}>
    {src && (
      <>
        {/* Ambient glow blob */}
        <div className="absolute -inset-3 rounded-2xl bg-primary/25 blur-2xl opacity-50 group-hover:opacity-80 transition-opacity duration-500 pointer-events-none" />
        {/* Secondary accent glow */}
        <div className="absolute -inset-1 rounded-xl bg-gradient-to-br from-primary/10 via-transparent to-secondary/10 blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
      </>
    )}
    <div
      className={`relative rounded-xl overflow-hidden border bg-card transition-all duration-300 ${
        src
          ? "border-white/40 shadow-xl shadow-primary/15 group-hover:shadow-2xl group-hover:shadow-primary/35 group-hover:border-white/70 group-hover:scale-[1.015]"
          : "border-primary/20 shadow-xl shadow-primary/10"
      }`}
    >
      {src ? (
        <img
          src={src}
          alt={label}
          className="w-full h-auto block cursor-zoom-in"
          style={{ filter: "contrast(1.05) saturate(1.05)" }}
          onClick={onClick}
        />
      ) : (
        <>
          <div className="bg-card border-b border-border px-4 py-2.5 flex items-center gap-2">
            <div className="flex gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full bg-red-400/50" />
              <div className="h-2.5 w-2.5 rounded-full bg-yellow-400/50" />
              <div className="h-2.5 w-2.5 rounded-full bg-green-400/50" />
            </div>
            <div className="flex-1 bg-background/60 rounded h-4 mx-4 max-w-48" />
          </div>
          <div className="aspect-[16/10] bg-background/30 flex">
            <div className="w-1/4 border-r border-border/40 p-3 space-y-2.5">
              {[80, 65, 75, 55, 70].map((w, i) => (
                <div
                  key={i}
                  className={`h-2 rounded ${i === 1 ? "bg-primary/40" : "bg-border/40"}`}
                  style={{ width: `${w}%` }}
                />
              ))}
            </div>
            <div className="flex-1 p-4 space-y-3">
              <div className="h-3 rounded bg-border/40 w-1/3 mb-4" />
              <div className="grid grid-cols-3 gap-2 mb-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-12 rounded bg-card border border-border/50" />
                ))}
              </div>
              <div className="space-y-2">
                {[90, 75, 82, 68].map((w, i) => (
                  <div key={i} className="h-2 rounded bg-border/30" style={{ width: `${w}%` }} />
                ))}
              </div>
            </div>
          </div>
          <div className="bg-card border-t border-border px-4 py-2 text-center">
            <span className="text-xs text-muted-foreground/50 font-medium tracking-wide">
              {label} — Screenshot placeholder
            </span>
          </div>
        </>
      )}
    </div>
  </div>
);

const Index = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [isCheckoutLoading, setIsCheckoutLoading] = useState(false);
  const [isTrialDialogOpen, setIsTrialDialogOpen] = useState(false);
  const [checkoutEmail, setCheckoutEmail] = useState("");
  const [checkoutError, setCheckoutError] = useState("");
  const [existingAccount, setExistingAccount] = useState(false);
  const [legalAccepted, setLegalAccepted] = useState(false);
  const [testimonialIndex, setTestimonialIndex] = useState(0);
  const [testimonialPaused, setTestimonialPaused] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [carouselPaused, setCarouselPaused] = useState(false);
  const isDevAccessCheckoutBlocked = !user && isProtectedDevHost();

  useEffect(() => {
    if (isDevAccessCheckoutBlocked) {
      window.localStorage.removeItem(TRIAL_DIALOG_DRAFT_STORAGE_KEY);
      return;
    }

    const savedDraft = window.localStorage.getItem(TRIAL_DIALOG_DRAFT_STORAGE_KEY);
    if (!savedDraft) return;

    try {
      const parsedDraft = JSON.parse(savedDraft) as {
        checkoutEmail?: unknown;
        legalAccepted?: unknown;
        shouldReopen?: unknown;
      };

      if (typeof parsedDraft.checkoutEmail === "string") {
        setCheckoutEmail(parsedDraft.checkoutEmail);
      }

      if (typeof parsedDraft.legalAccepted === "boolean") {
        setLegalAccepted(parsedDraft.legalAccepted);
      }

      if (parsedDraft.shouldReopen === true) {
        setIsTrialDialogOpen(true);
      }
    } catch {
      window.localStorage.removeItem(TRIAL_DIALOG_DRAFT_STORAGE_KEY);
    }
  }, [isDevAccessCheckoutBlocked]);

  useEffect(() => {
    if (!isTrialDialogOpen && !checkoutEmail && !legalAccepted) return;

    window.localStorage.setItem(
      TRIAL_DIALOG_DRAFT_STORAGE_KEY,
      JSON.stringify({
        checkoutEmail,
        legalAccepted,
        shouldReopen: isTrialDialogOpen,
      })
    );
  }, [checkoutEmail, isTrialDialogOpen, legalAccepted]);

  useEffect(() => {
    if (!loading && user) {
      navigate("/dashboard");
    }
  }, [user, loading, navigate]);

  const makePayment = async () => {
    if (isCheckoutLoading) return;

    if (isDevAccessCheckoutBlocked) {
      setExistingAccount(false);
      setCheckoutError("Sign in with a dev-approved account to start checkout here.");
      return;
    }

    const normalizedEmail = checkoutEmail.trim().toLowerCase();

    if (!normalizedEmail) {
      setExistingAccount(false);
      setCheckoutError("Enter your email to continue.");
      return;
    }

    const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);

    if (!isValidEmail) {
      setExistingAccount(false);
      setCheckoutError("Enter a valid email address.");
      return;
    }

    if (!legalAccepted) {
      setExistingAccount(false);
      setCheckoutError("Please agree to the Terms and Privacy Policy to continue.");
      return;
    }

    setIsCheckoutLoading(true);
    setCheckoutError("");
    setExistingAccount(false);

    try {
      const response = await fetch(`${getFunctionsBaseUrl()}/stripe/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: normalizedEmail,
          source: LANDING_CHECKOUT_SOURCE,
        }),
      });

      if (!response.ok) {
        if (response.status === 409) {
          const data = await response.json();
          setExistingAccount(data.existingAccount === true);
          setCheckoutError(data.error || "User with this account already exists.");
          setIsCheckoutLoading(false);
          return;
        }

        throw new Error(`Checkout failed: ${response.status}`);
      }

      const session = await response.json();

      window.localStorage.removeItem(TRIAL_DIALOG_DRAFT_STORAGE_KEY);
      window.location.href = session.url;
    } catch (err) {
      console.error("Payment error:", err);
      setCheckoutError("Unable to start checkout right now.");
      setIsCheckoutLoading(false);
    }
  };

  const scrollToLandingSection = (sectionId: string) => {
    const section = document.getElementById(sectionId);
    if (!section) return;

    section.scrollIntoView({ behavior: "smooth", block: "start" });
    window.history.pushState(null, "", `#${sectionId}`);
  };

  const scrollToLandingTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    window.history.pushState(null, "", window.location.pathname);
  };

  useEffect(() => {
    if (testimonialPaused) return;
    const timer = setInterval(() => {
      setTestimonialIndex((i) => (i === TESTIMONIALS.length - 1 ? 0 : i + 1));
    }, 6000);
    return () => clearInterval(timer);
  }, [testimonialPaused]);

  const prevTestimonial = () =>
    setTestimonialIndex((i) => (i === 0 ? TESTIMONIALS.length - 1 : i - 1));

  const nextTestimonial = () =>
    setTestimonialIndex((i) => (i === TESTIMONIALS.length - 1 ? 0 : i + 1));

  return (
    <div className="min-h-screen bg-background text-foreground">

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 bg-background border-b border-border z-50 shadow-lg">
        <div className="container mx-auto px-4 sm:px-6 py-2 flex items-center justify-between">

          <button
            type="button"
            onClick={scrollToLandingTop}
            className="rounded-md focus:outline-none"
            aria-label="Back to top"
          >
            <img src={surosLogo} alt="Suros Logic Systems" className="h-10 sm:h-12 md:h-16" />
          </button>

          <div className="hidden lg:flex items-center gap-1 ml-8">
            {[
              { id: "plan-analysis", label: "Plan Analysis" },
              { id: "features", label: "Features" },
              { id: "demo-video", label: "Demo Video" },
              { id: "testimonials", label: "Testimonials" },
              { id: "pricing", label: "Pricing" },
            ].map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  scrollToLandingSection(item.id);
                }}
                className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-card hover:text-primary"
              >
                {item.label}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-2 sm:gap-3 ml-auto">
            <a
              href="tel:+17275033980"
              className="hidden md:flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              <Phone size={15} />
              <span>(727) 503-3980</span>
            </a>

            <Button size="sm" className="hidden sm:flex md:h-12 md:px-6 bg-primary hover:bg-primary/90" asChild>
              <a
                href="https://calendly.com/astutemarketing-agency/new-meeting"
                target="_blank"
                rel="noopener noreferrer"
              >
                Book a Demo
              </a>
            </Button>

            <Button
              size="sm"
              variant="outline"
              className="hidden sm:flex md:h-12 md:px-6 border-white/40 text-white hover:bg-white/10"
              asChild
            >
              <a href="/auth">Login</a>
            </Button>

            <button
              type="button"
              onClick={() => setMobileMenuOpen((o) => !o)}
              className="lg:hidden p-2 rounded-md text-muted-foreground hover:text-primary hover:bg-card transition-colors"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-border bg-background">
            <div className="container mx-auto px-4 py-4 space-y-1">
              {[
                { id: "plan-analysis", label: "Plan Analysis" },
                { id: "features", label: "Features" },
                { id: "demo-video", label: "Demo Video" },
                { id: "testimonials", label: "Testimonials" },
                { id: "pricing", label: "Pricing" },
              ].map((item) => (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    scrollToLandingSection(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className="block rounded-md px-4 py-3 text-sm font-medium text-muted-foreground hover:bg-card hover:text-primary transition-colors"
                >
                  {item.label}
                </a>
              ))}
              <div className="pt-3 mt-3 border-t border-border space-y-2">
                <a
                  href="tel:+17275033980"
                  className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  <Phone size={15} />
                  (727) 503-3980
                </a>
                <div className="flex gap-2 px-2">
                  <Button size="sm" className="flex-1 bg-primary hover:bg-primary/90" asChild>
                    <a href="https://calendly.com/astutemarketing-agency/new-meeting" target="_blank" rel="noopener noreferrer">
                      Book a Demo
                    </a>
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1 border-white/40 text-white hover:bg-white/10" asChild>
                    <a href="/auth">Login</a>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* Hero */}
      <section className="pt-28 sm:pt-36 pb-16 sm:pb-24 px-4 sm:px-6 text-center">
        <div className="container mx-auto max-w-6xl">
          <div className="space-y-5 sm:space-y-6 animate-fade-in">
            <h1 className="text-3xl sm:text-5xl lg:text-7xl font-bold leading-tight tracking-tight">
              Close More Jobs.{" "}
              <span className="inline-block bg-gradient-to-r from-primary via-secondary to-primary bg-clip-text text-transparent animate-pulse px-1">
                Bid Faster.
              </span>{" "}
              Run Every Project From One Platform.
            </h1>
            <p className="text-base sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Suros Logic Systems is your AI-powered estimating and bid management workspace. Build
              professional proposals from your own notes in minutes — or upload plan drawings for
              AI-extracted scopes, safety analysis, and more. Start to finish in a fraction of the time it takes today.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
              <Button size="lg" className="bg-primary hover:bg-primary/90 text-lg" asChild>
                <a
                  href="https://calendly.com/astutemarketing-agency/new-meeting"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Book a Demo <ArrowRight className="ml-2" />
                </a>
              </Button>
              <Button
                onClick={() => window.open("/sample_bid.pdf", "_blank")}
                size="lg"
                variant="outline"
                className="text-lg"
              >
                See Sample Bid
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Strip */}
      <section className="py-12 px-6 border-y border-border bg-card/20">
        <div className="container mx-auto">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 text-center">
            {[
              {
                value: "3×",
                label: "Win rate for bids submitted within 24 hours vs. bids sent a week later",
              },
              {
                value: "80%",
                label: "Less time spent writing trade scopes with AI-extracted plan analysis",
              },
              {
                value: "10 min",
                label: "From upload to full project insights — as little as 10 minutes on standard plan sets",
              },
              {
                value: "90%",
                label: "Feature capture accuracy across architectural and engineering plan drawings",
              },
            ].map((stat, idx) => (
              <div key={idx} className="space-y-2">
                <div className="text-4xl lg:text-5xl font-bold text-primary">{stat.value}</div>
                <div className="text-sm text-muted-foreground leading-snug max-w-48 mx-auto">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Ratings + Logos */}
      <section className="py-16 px-6 border-y border-border">
        <div className="container mx-auto max-w-5xl">
          <div className="text-center mb-10 space-y-3">
            <style>{`
              @keyframes starShimmer {
                0%, 100% { transform: scale(1); filter: drop-shadow(0 0 0px transparent); }
                50% { transform: scale(1.1); filter: drop-shadow(0 0 6px hsl(var(--primary) / 0.65)); }
              }
            `}</style>
            <div className="flex items-center justify-center gap-1.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  size={28}
                  className="fill-primary text-primary"
                  style={{
                    animation: "starShimmer 5s ease-in-out infinite",
                    animationDelay: `${i * 0.5}s`,
                  }}
                />
              ))}
            </div>
            <h3 className="text-2xl font-bold">Rated 5/5 stars across all our customers</h3>
            <p className="text-muted-foreground">
              Trusted by contractors, remodelers, and trade professionals across the industry.
            </p>
          </div>

          <style>{`
            @keyframes logoMarquee {
              from { transform: translateX(-50%); }
              to { transform: translateX(0); }
            }
          `}</style>
          <div
            className="relative overflow-hidden"
            style={{
              WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 18%, black 82%, transparent 100%)',
              maskImage: 'linear-gradient(to right, transparent 0%, black 18%, black 82%, transparent 100%)',
            }}
          >
            <div
              className="flex items-center"
              style={{
                animation: 'logoMarquee 28s linear infinite',
                animationPlayState: carouselPaused ? 'paused' : 'running',
                width: 'max-content',
                willChange: 'transform',
              }}
              onMouseEnter={() => setCarouselPaused(true)}
              onMouseLeave={() => setCarouselPaused(false)}
            >
              {[...CLIENT_LOGOS, ...CLIENT_LOGOS].map((logo, idx) => (
                <div key={idx} className="shrink-0 pr-10 sm:pr-24 group" style={{ flexShrink: 0 }}>
                  <img
                    src={logo.src}
                    alt={logo.name}
                    className={`object-contain block group-hover:scale-110 group-hover:brightness-150 transition-all duration-200 ${
                      logo.name === "Seagulf Painting"
                        ? "h-28 max-w-[240px]"
                        : logo.name === "Last Call Home Solutions"
                        ? "h-44 max-w-[240px]"
                        : "h-20 max-w-[200px]"
                    }`}
                    style={
                      logo.name === "Elite Walls And Ceilings"
                        ? { filter: "grayscale(1) sepia(1) hue-rotate(-10deg) saturate(8) brightness(1.3)" }
                        : undefined
                    }
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* AI Plan Analysis */}
      <section id="plan-analysis" className="scroll-mt-24 py-20 px-6 bg-card/30">
        <div className="container mx-auto max-w-7xl">
          <div className="text-center mb-12 space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-secondary/30 bg-secondary/10 px-4 py-1.5 text-sm font-medium text-secondary">
              Plan Analyzer — Optional Power Feature
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold">
              AI Plan Analyses in{" "}
              <span className="text-primary">As Little As 10 Minutes</span>
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
              <strong className="text-foreground">90% feature capture accuracy.</strong> When you
              have drawings, this is the fastest way to turn them into actionable scopes, safety
              analyses, verifications, conflicts, and RFIs. No drawings on hand? Skip straight to the
              bid form and build your estimate from scratch with the help of our other AI-Powered features.
            </p>
          </div>

          <div className="mb-12">
            <ScreenshotPlaceholder label="Plan Analyzer" src="/Plan_Analyzer.png" onClick={() => setLightboxSrc("/Plan_Analyzer.png")} />
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <Card className="bg-card border-primary/20 hover:border-primary/40 transition-colors">
              <CardContent className="p-8 space-y-5">
                <div className="text-2xl font-bold text-primary">Accurate Scope Analysis</div>
                <p className="text-muted-foreground">
                  Generate detailed, trade-specific scopes immediately from your drawings. Our AI
                  captures:
                </p>
                <div className="flex flex-wrap gap-2">
                  {[
                    "Demo",
                    "Structural",
                    "Framing",
                    "Exterior Envelope",
                    "Doors/Windows",
                    "Roofing",
                    "Plumbing",
                    "Electrical",
                    "Concrete/Masonry",
                    "Drywall/Insulation",
                    "Flooring/Tile",
                    "Paint/Finishes",
                    "Millwork/Cabinets",
                    "HVAC",
                  ].map((trade) => (
                    <span
                      key={trade}
                      className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
                    >
                      {trade}
                    </span>
                  ))}
                </div>
                <p className="text-sm text-muted-foreground">
                  Save up to 80% of your scope preparation time with AI-extracted, trade-specific
                  breakdowns generated immediately from your uploaded drawings.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-card border-secondary/20 hover:border-secondary/40 transition-colors">
              <CardContent className="p-8 space-y-5">
                <div className="text-2xl font-bold text-secondary">
                  Create Bids &amp; Export in Seconds
                </div>
                <p className="text-muted-foreground">
                  Take your plan analysis directly into a bid. Use AI-extracted scopes to
                  pre-populate your bid form, generate professional proposals, and export fully
                  drafted documents ready to send to clients.
                </p>
                <ul className="space-y-2.5">
                  {[
                    "Start a bid directly from extracted trade scopes",
                    "AI generates bid language in construction-standard format",
                    "Export a fully drafted proposal document",
                    "Everything managed from one connected workspace",
                  ].map((item, idx) => (
                    <li
                      key={idx}
                      className="flex items-start gap-2 text-sm text-muted-foreground"
                    >
                      <Check className="text-secondary mt-0.5 flex-shrink-0" size={16} />
                      {item}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Feature Screenshot Sections */}
      <section id="features" className="scroll-mt-24 py-20 px-6">
        <div className="container mx-auto max-w-7xl">
          <div className="text-center mb-20 space-y-3">
            <h2 className="text-3xl sm:text-4xl font-bold">Everything your bid needs, connected</h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Start from your own notes or from uploaded drawings — one workspace takes you from
              rough scope to polished proposal, change orders, and project files.
            </p>
            <div className="inline-flex items-center rounded-full border border-border bg-card px-4 py-1.5 text-sm text-muted-foreground mt-2">
              No plan drawings? Start at Step 02 — the bid form works without them.
            </div>
          </div>

          <div className="space-y-16 lg:space-y-24">
            {/* Feature 1 */}
            <div className="grid lg:grid-cols-[2fr_3fr] gap-12 items-center">
              <div className="space-y-6">
                <div className="flex items-center gap-3">
                  <div className="text-xs font-semibold text-primary uppercase tracking-widest">
                    Step 01
                  </div>
                  <span className="rounded-full border border-border bg-card px-2.5 py-0.5 text-xs text-muted-foreground">
                    Optional
                  </span>
                </div>
                <h3 className="text-3xl font-bold">Analyze the Plans First</h3>
                <p className="text-muted-foreground text-lg leading-relaxed">
                  Have architectural or engineering drawings? Upload them and get a complete project breakdown in minutes —
                  scopes, safety notes, conflicts, and RFIs extracted automatically. Don't have
                  drawings? Skip this step entirely and start your bid in Step 02.
                </p>
                <ul className="space-y-2.5">
                  {[
                    "Project overview summary",
                    "Trade-specific scope breakdowns",
                    "Safety risk identification",
                    "Drawing conflict flags",
                    "RFI suggestions",
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-2.5 text-muted-foreground">
                      <Check className="text-primary flex-shrink-0" size={16} />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <ScreenshotPlaceholder label="Plan Analyzer" src="/Plan_Analyzer_Overview.png" onClick={() => setLightboxSrc("/Plan_Analyzer_Overview.png")} />
            </div>

            {/* Feature 2 */}
            <div className="grid lg:grid-cols-[3fr_2fr] gap-12 items-center">
              <ScreenshotPlaceholder label="Bid Form" src="/Bid_Form.png" onClick={() => setLightboxSrc("/Bid_Form.png")} className="order-2 lg:order-1" />
              <div className="space-y-6 order-1 lg:order-2">
                <div className="text-xs font-semibold text-primary uppercase tracking-widest">
                  Step 02
                </div>
                <h3 className="text-3xl font-bold">Build the Bid</h3>
                <p className="text-muted-foreground text-lg leading-relaxed">
                  Start from your extracted scopes or build manually. Fill in company details,
                  client info, and trade scopes — then use the built-in AI price estimating tool
                  to generate cost estimates for each scope item. AI expands everything into
                  industry-standard bid language ready to send.
                </p>
                <ul className="space-y-2.5">
                  {[
                    "Pre-populate fields from plan analysis scopes",
                    "AI-expanded, professional trade scope descriptions",
                    "AI-powered price estimating tool for each scope item entered",
                    "Payment terms and project timeline",
                    "Company and client details",
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-2.5 text-muted-foreground">
                      <Check className="text-primary flex-shrink-0" size={16} />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Feature 3 */}
            <div className="grid lg:grid-cols-[2fr_3fr] gap-12 items-center">
              <div className="space-y-6">
                <div className="text-xs font-semibold text-primary uppercase tracking-widest">
                  Step 03
                </div>
                <h3 className="text-3xl font-bold">Generate &amp; Export Proposals</h3>
                <p className="text-muted-foreground text-lg leading-relaxed">
                  Review and edit your bid form, generate the client-facing proposal, and download a
                  polished document ready to send. Consistent, professional formatting every time —
                  no more fighting with Word templates.
                </p>
                <ul className="space-y-2.5">
                  {[
                    "Editable bid form and proposal tabs",
                    "Clean, professional document layout",
                    "Downloadable proposal files",
                    "Consistent formatting across every project",
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-2.5 text-muted-foreground">
                      <Check className="text-primary flex-shrink-0" size={16} />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <ScreenshotPlaceholder label="Proposal Output" src="/Bid_proposal.png" onClick={() => setLightboxSrc("/Bid_proposal.png")} />
            </div>

            {/* Feature 4 */}
            <div className="grid lg:grid-cols-[3fr_2fr] gap-12 items-center">
              <ScreenshotPlaceholder label="Project Workspace" src="/Project_Workspace.png" onClick={() => setLightboxSrc("/Project_Workspace.png")} className="order-2 lg:order-1" />
              <div className="space-y-6 order-1 lg:order-2">
                <div className="text-xs font-semibold text-primary uppercase tracking-widest">
                  Step 04
                </div>
                <h3 className="text-3xl font-bold">Manage the Project</h3>
                <p className="text-muted-foreground text-lg leading-relaxed">
                  Once the bid is sent, your workspace keeps the job organized. Track status, manage
                  change orders, store project files, and keep everything connected to the bid it
                  belongs to.
                </p>
                <ul className="space-y-2.5">
                  {[
                    "Project status timeline from bid to completion",
                    "Change order creation and linked proposals",
                    "Project file storage and organization",
                    "All documents tied to the original bid",
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-2.5 text-muted-foreground">
                      <Check className="text-primary flex-shrink-0" size={16} />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Vision */}
      <section id="vision" className="scroll-mt-24 py-20 px-6 bg-card/30">
        <div className="container mx-auto max-w-4xl text-center">
          <h2 className="text-4xl font-bold mb-6">Our Vision</h2>
          <p className="text-xl text-muted-foreground leading-relaxed">
            Suros Logic Systems was built by people who know the contracting world firsthand.
            We&apos;re building an AI-driven workspace for service businesses that helps teams create
            quotes faster, keep project documents organized, and spend more time winning and running
            jobs.
          </p>
        </div>
      </section>

      {/* Demo Video */}
      <section id="demo-video" className="scroll-mt-24 py-20 px-4 sm:px-6">
        <div className="container mx-auto max-w-7xl">
          <div className="text-center mb-10 space-y-4">
            <h2 className="text-3xl sm:text-4xl font-bold">Watch the demos</h2>
            <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
              See the platform in action — from building a bid to analyzing a full set of plan drawings.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Video 1 */}
            <Card className="bg-card/80 backdrop-blur border-primary/20 shadow-xl shadow-primary/10 overflow-hidden">
              <CardContent className="p-4 sm:p-6 space-y-4">
                <h3 className="text-lg font-semibold text-foreground">Bid Form Creation &amp; Bid Workspace</h3>
                <div className="rounded-xl overflow-hidden border border-border bg-black flex items-center justify-center">
                  <video
                    className="w-full h-auto max-h-[280px] object-contain"
                    controls
                    preload="metadata"
                    playsInline
                    poster={demoVideoThumbnail}
                  >
                    <source src={BID_FORM_VIDEO_URL} type="video/mp4" />
                    Your browser does not support the video tag.
                  </video>
                </div>
                <p className="text-sm text-muted-foreground text-center">
                  <a
                    href={BID_FORM_VIDEO_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline underline-offset-4 hover:text-primary/80"
                  >
                    Open in a new tab
                  </a>
                </p>
              </CardContent>
            </Card>

            {/* Video 2 */}
            <Card className="bg-card/80 backdrop-blur border-primary/20 shadow-xl shadow-primary/10 overflow-hidden">
              <CardContent className="p-4 sm:p-6 space-y-4">
                <h3 className="text-lg font-semibold text-foreground">Plan Analyzer</h3>
                <div className="rounded-xl overflow-hidden border border-border bg-black flex items-center justify-center">
                  <video
                    className="w-full h-auto max-h-[280px] object-contain"
                    controls
                    preload="metadata"
                    playsInline
                    poster={demoVideoThumbnail}
                  >
                    <source src={PLAN_ANALYZER_VIDEO_URL} type="video/mp4" />
                    Your browser does not support the video tag.
                  </video>
                </div>
                <p className="text-sm text-muted-foreground text-center">
                  <a
                    href={PLAN_ANALYZER_VIDEO_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline underline-offset-4 hover:text-primary/80"
                  >
                    Open in a new tab
                  </a>
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section id="testimonials" className="scroll-mt-24 py-20 px-6 bg-card/30">
        <div className="container mx-auto max-w-4xl">
          <div className="text-center mb-12 space-y-4">
            <h2 className="text-3xl sm:text-4xl font-bold">
              Why contractors trust Suros Logic Systems
            </h2>
            <p className="text-muted-foreground text-lg">
              Bid creation, plan analysis, and project management software built for the trades.
            </p>
          </div>

          <div>
            <Card
              className="bg-card border-primary/20 hover:border-primary/70 hover:shadow-xl hover:shadow-primary/30 transition-all h-[540px] sm:h-[420px] flex flex-col"
              onMouseEnter={() => setTestimonialPaused(true)}
              onMouseLeave={() => setTestimonialPaused(false)}
            >
              <CardContent className="p-6 sm:p-10 flex flex-col h-full">
                <div className="flex gap-1 mb-6">
                  {Array.from({ length: TESTIMONIALS[testimonialIndex].stars }).map((_, i) => (
                    <Star key={i} size={20} className="fill-primary text-primary" />
                  ))}
                </div>

                <blockquote className="text-base sm:text-xl text-foreground leading-relaxed mb-6 sm:mb-8 flex-1 overflow-y-auto">
                  &ldquo;{TESTIMONIALS[testimonialIndex].quote}&rdquo;
                </blockquote>

                <div className="pt-5 border-t border-border/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <img
                      src={TESTIMONIALS[testimonialIndex].photo}
                      alt={TESTIMONIALS[testimonialIndex].name}
                      className="h-10 w-10 sm:h-11 sm:w-11 rounded-full object-cover border-2 border-primary/30 flex-shrink-0"
                    />
                    <div>
                      <div className="font-semibold text-foreground leading-tight">
                        {TESTIMONIALS[testimonialIndex].name}
                      </div>
                      <div className="text-sm sm:text-base text-muted-foreground leading-tight mt-0.5">
                        {TESTIMONIALS[testimonialIndex].company}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={prevTestimonial}
                      className="rounded-full border border-border p-2 text-muted-foreground hover:text-primary hover:border-primary transition-colors"
                      aria-label="Previous testimonial"
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <span className="text-sm text-muted-foreground tabular-nums w-10 text-center">
                      {testimonialIndex + 1} / {TESTIMONIALS.length}
                    </span>
                    <button
                      onClick={nextTestimonial}
                      className="rounded-full border border-border p-2 text-muted-foreground hover:text-primary hover:border-primary transition-colors"
                      aria-label="Next testimonial"
                    >
                      <ChevronRight size={18} />
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Testimonials */}
            <div className="flex justify-center gap-2 mt-6">
              {TESTIMONIALS.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setTestimonialIndex(idx)}
                  className={`h-2 rounded-full transition-all ${
                    idx === testimonialIndex
                      ? "w-8 bg-primary"
                      : "w-2 bg-border hover:bg-primary/40"
                  }`}
                  aria-label={`Go to testimonial ${idx + 1}`}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Built for the trades */}
      <section className="py-20 px-6">
        <div className="container mx-auto max-w-5xl">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-10 sm:mb-16">Built for the trades</h2>
          <div className="grid md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border border border-border rounded-xl overflow-hidden">
            {[
              {
                number: "01",
                title: "General Contractors & Remodelers",
                description:
                  "Handle multiple bids daily with consistent, professional formatting. Move faster from plan analysis to proposal without sacrificing quality.",
              },
              {
                number: "02",
                title: "Specialty Trades",
                description:
                  "Plumbing, electrical, HVAC, flooring, tile, painting — keep scope documents, change orders, and project files organized in one place.",
              },
              {
                number: "03",
                title: "Estimators & Office Managers",
                description:
                  "Spend less time hunting down document versions and more time getting clean, accurate proposals out the door.",
              },
            ].map((item, idx) => (
              <div
                key={idx}
                className="bg-card p-8 space-y-4 hover:bg-card/60 transition-colors"
              >
                <h3 className="text-xl font-semibold leading-snug">{item.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="scroll-mt-24 py-20 px-4 sm:px-6 bg-card/30 overflow-x-hidden">
        <div className="container mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Simple pricing that pays for itself</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            <Card className="relative overflow-visible bg-card border-primary/40 hover:border-primary/70 hover:shadow-xl hover:shadow-primary/30 transition-all">
              <CardContent className="p-8 space-y-6">
                <div className="pointer-events-none absolute -right-3 -top-4 sm:-right-5 sm:-top-5 z-10 rotate-[12deg] border border-primary/40 bg-primary px-3 py-1.5 sm:px-4 sm:py-2 text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.16em] text-primary-foreground shadow-lg shadow-primary/30">
                  Limited Time Offer:
                  <br />
                  50% off for life!
                </div>
                <h3 className="text-2xl font-bold text-primary">Quick Start Bid Bundle</h3>
                <div className="space-y-2">
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="text-2xl font-semibold text-muted-foreground line-through">
                      $300/month
                    </div>
                    <div className="text-3xl font-bold text-primary">
                      $150
                      <span className="text-lg text-muted-foreground">/month</span>
                    </div>
                  </div>
                  <p className="font-medium text-primary">30-day free trial included</p>
                  <p className="text-sm text-muted-foreground">
                    Trial includes 1 Plan Analysis. Paid subscription includes 3 per month.
                  </p>
                </div>
                <ul className="space-y-3">
                  {[
                    "Access to bid workspaces for each saved project",
                    "Workspace overview, bid form, proposal, change orders, and project files",
                    "AI-tuned prompts for clean, detailed bids",
                    "Project status tracking from bid creation through completion",
                    "Upload plan drawings for AI project summaries, trade scopes, safety notes, conflicts, and RFIs",
                  ].map((item, idx) => (
                    <li key={idx} className="flex items-start gap-3">
                      <Check className="text-primary mt-1 flex-shrink-0" size={20} />
                      <span className="text-muted-foreground">{item}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  className="w-full bg-primary hover:bg-primary/90"
                  size="lg"
                  onClick={() => {
                    if (isDevAccessCheckoutBlocked) return;
                    setCheckoutError("");
                    setExistingAccount(false);
                    setIsTrialDialogOpen(true);
                  }}
                  disabled={isCheckoutLoading || isDevAccessCheckoutBlocked}
                  title={
                    isDevAccessCheckoutBlocked
                      ? "Sign in with a dev-approved account to start checkout here."
                      : undefined
                  }
                >
                  Start 30-Day Free Trial
                </Button>
              </CardContent>
            </Card>

            <Card className="h-full bg-gradient-to-br from-card to-secondary/10 border-secondary/40 hover:border-secondary/70 hover:shadow-xl hover:shadow-secondary/30 transition-all">
              <CardContent className="flex h-full flex-col justify-between p-8 gap-8">
                <div className="space-y-6">
                  <h3 className="text-2xl font-bold text-secondary">Custom Workflow Build</h3>
                  <div className="space-y-2">
                    <div className="text-3xl font-bold">
                      Custom<span className="text-lg text-muted-foreground"> pricing</span>
                    </div>
                    <p className="text-muted-foreground">Setup &amp; monthly based on complexity</p>
                  </div>
                  <ul className="space-y-3">
                    {[
                      "Everything from Quick Start subscription",
                      "Custom bid output templates that match your company's specific style and format",
                      "Tailored prompts for your trades & regions",
                      "Higher Plan Analysis quotas for uploading and analyzing more plan drawings",
                      "Custom workflows and automations tailored to your company's specific needs",
                      "Built for multi-location companies with more specific needs and requirements",
                    ].map((item, idx) => (
                      <li key={idx} className="flex items-start gap-3">
                        <Check className="text-secondary mt-1 flex-shrink-0" size={20} />
                        <span className="text-muted-foreground">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <Button
                  className="w-full bg-secondary hover:bg-secondary/90 text-secondary-foreground"
                  size="lg"
                  asChild
                >
                  <a
                    href="https://calendly.com/astutemarketing-agency/new-meeting"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Schedule a Meeting
                  </a>
                </Button>
              </CardContent>
            </Card>
          </div>
          <p className="text-center text-muted-foreground mt-8 max-w-2xl mx-auto">
            All plans include onboarding support and access to improvements as we upgrade the
            system.
          </p>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-32 px-6 bg-gradient-to-br from-primary/20 via-background to-secondary/20">
        <div className="container mx-auto max-w-4xl text-center space-y-8">
          <h2 className="text-3xl sm:text-5xl font-bold">
            Ready to stop wasting time rewriting the same bid for the 100th time?
          </h2>
          <p className="text-base sm:text-xl text-muted-foreground">
            Book a quick walkthrough and see whether Suros Logic fits the way your team already
            works.
          </p>

          <Card className="bg-card/80 backdrop-blur">
            <CardContent className="p-8">
              <Button size="lg" className="w-full bg-primary hover:bg-primary/90 text-lg" asChild>
                <a
                  href="https://calendly.com/astutemarketing-agency/new-meeting"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Book My Demo <ArrowRight className="ml-2" />
                </a>
              </Button>
              <p className="mt-6 text-sm text-muted-foreground">
                <a
                  onClick={() => window.open("/sample_bid.pdf", "_blank")}
                  className="underline hover:text-primary cursor-pointer"
                >
                  See Sample Bid
                </a>
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Lightbox */}
      {lightboxSrc && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setLightboxSrc(null)}
        >
          <img
            src={lightboxSrc}
            alt="Screenshot expanded view"
            className="max-h-[90vh] max-w-[90vw] rounded-xl shadow-2xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setLightboxSrc(null)}
            className="absolute top-4 right-4 rounded-full bg-black/60 p-2 text-white hover:bg-black/80 transition-colors"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
      )}

      {/* Trial Dialog */}
      <Dialog open={isTrialDialogOpen} onOpenChange={setIsTrialDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Enter your email to get started.</DialogTitle>
            <DialogDescription>We&apos;ll guide you through the next step.</DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="checkout-email">Email</Label>
            <Input
              id="checkout-email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              value={checkoutEmail}
              onChange={(e) => setCheckoutEmail(e.target.value)}
              disabled={isCheckoutLoading}
            />
          </div>

          <label className="flex items-start gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-border"
              checked={legalAccepted}
              onChange={(event) => {
                setLegalAccepted(event.target.checked);
                if (event.target.checked && checkoutError.includes("Terms")) {
                  setCheckoutError("");
                }
              }}
              disabled={isCheckoutLoading}
            />
            <span>
              I agree to the{" "}
              <Link
                to="/terms"
                state={{ fromLanding: true }}
                className="underline underline-offset-4 hover:text-primary"
              >
                Terms and Conditions
              </Link>{" "}
              and{" "}
              <Link
                to="/privacy"
                state={{ fromLanding: true }}
                className="underline underline-offset-4 hover:text-primary"
              >
                Privacy Policy
              </Link>
              .
            </span>
          </label>

          {checkoutError && <p className="text-sm text-red-500">{checkoutError}</p>}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                if (isCheckoutLoading) return;
                setCheckoutError("");
                setExistingAccount(false);
                setLegalAccepted(false);
                setCheckoutEmail("");
                window.localStorage.removeItem(TRIAL_DIALOG_DRAFT_STORAGE_KEY);
                setIsTrialDialogOpen(false);
              }}
              disabled={isCheckoutLoading}
            >
              Cancel
            </Button>
            {existingAccount ? (
              <Button
                className="bg-[#1e73be] text-white hover:bg-[#175a94]"
                onClick={() => navigate("/auth")}
                disabled={isCheckoutLoading}
              >
                Go to Login
              </Button>
            ) : (
              <Button
                className="bg-primary hover:bg-primary/90"
                onClick={makePayment}
                disabled={isCheckoutLoading}
              >
                {isCheckoutLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Redirecting...
                  </>
                ) : (
                  "Continue to Stripe"
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-border">
        <div className="container mx-auto text-center space-y-4">
          <img src={surosLogo} alt="Suros Logic Systems" className="h-10 mx-auto opacity-70" />
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to="/terms"
              state={{ fromLanding: true }}
              className="text-sm text-muted-foreground underline underline-offset-4 hover:text-primary"
            >
              Terms and Conditions
            </Link>
            <Link
              to="/privacy"
              state={{ fromLanding: true }}
              className="text-sm text-muted-foreground underline underline-offset-4 hover:text-primary"
            >
              Privacy Policy
            </Link>
          </div>
          <p className="text-muted-foreground">© 2026 Suros Logic Systems. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
