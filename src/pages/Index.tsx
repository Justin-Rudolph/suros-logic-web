import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight, Check, FileText, Zap, Shield, Clock, Wrench, Home, Hammer, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import demoVideoThumbnail from "@/assets/demo_video_thumbnail.png";
import surosLogo from "@/assets/suros-logo-new.png";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

const DEMO_VIDEO_URL = "https://firebasestorage.googleapis.com/v0/b/suros-logic.firebasestorage.app/o/Suros%20Logic%20Demo%20-%203.3.26.mp4?alt=media&token=4cee2203-9b28-4196-9581-5ace255efb32";
const LANDING_CHECKOUT_SOURCE = "landing_quickstart";

const Index = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [isCheckoutLoading, setIsCheckoutLoading] = useState(false);
  const [isTrialDialogOpen, setIsTrialDialogOpen] = useState(false);
  const [checkoutEmail, setCheckoutEmail] = useState("");
  const [checkoutError, setCheckoutError] = useState("");
  const [existingAccount, setExistingAccount] = useState(false);

  // AUTO-REDIRECT IF LOGGED IN
  useEffect(() => {
    if (!loading && user) {
      navigate("/dashboard");
    }
  }, [user, loading, navigate]);

  const makePayment = async () => {
    if (isCheckoutLoading) return;

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

    setIsCheckoutLoading(true);
    setCheckoutError("");
    setExistingAccount(false);

    try {
      const apiBase = import.meta.env.DEV
        ? "http://127.0.0.1:5001/suros-logic/us-central1"
        : "https://us-central1-suros-logic.cloudfunctions.net";

      const response = await fetch(`${apiBase}/stripe/checkout`, {
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

      window.location.href = session.url;

    } catch (err) {
      console.error("Payment error:", err);
      setCheckoutError("Unable to start checkout right now.");
      setIsCheckoutLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 bg-background border-b border-border z-50 shadow-lg">
        <div className="container mx-auto px-3 sm:px-6 py-2 flex items-center justify-between">

          {/* LEFT: Logo */}
          <img
            src={surosLogo}
            alt="Suros Logic Systems"
            className="h-10 sm:h-12 md:h-16"
          />

          {/* RIGHT: Buttons */}
          <div className="flex items-center gap-2 sm:gap-4 ml-auto">

            <Button
              size="sm"
              className="md:h-12 md:px-6 bg-primary hover:bg-primary/90"
              asChild
            >
              <a
                href="https://calendly.com/astutemarketing-agency/new-meeting"
                target="_blank"
                rel="noopener noreferrer"
              >
                Book Free Demo
              </a>
            </Button>

            <Button
              size="sm"
              variant="outline"
              className="md:h-12 md:px-6 border-white/40 text-white hover:bg-white/10"
              asChild
            >
              <a href="/auth">Login</a>
            </Button>

          </div>
        </div>
      </nav>
      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6">
        <div className="container mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-8 animate-fade-in">
              <h1 className="text-5xl lg:text-7xl font-bold leading-tight">
                AI that writes {" "}<br />
                <span className="bg-gradient-to-r from-primary via-secondary to-primary bg-clip-text text-transparent animate-pulse">
                  bids for you
                </span>
              </h1>
              <p className="text-xl text-muted-foreground">
                Suros Logic Systems turns a simple project form into a fully formatted,
                professional bid document – in minutes, not hours.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Button size="lg" className="bg-primary hover:bg-primary/90 text-lg" asChild>
                  <a href="https://calendly.com/astutemarketing-agency/new-meeting" target="_blank" rel="noopener noreferrer">
                    Book a Free 15-Min Demo <ArrowRight className="ml-2" />
                  </a>
                </Button>
                <Button onClick={() => window.open("/sample_bid.pdf", "_blank")} size="lg" variant="outline" className="text-lg">
                  See Sample Bid
                </Button>
              </div>
            </div>
            <div
              className="relative animate-fade-in"
              style={{ animationDelay: "0.2s" }}
            >
              <Card className="bg-card/80 backdrop-blur border-primary/30 shadow-xl shadow-primary/10 rounded-2xl">
                <CardContent className="p-6 space-y-6">

                  {/* HEADER */}
                  <div className="space-y-2 text-center">
                    <h2 className="text-2xl font-bold text-secondary tracking-tight">
                      Create a Professional Bid in Minutes
                    </h2>
                  </div>

                  {/* STEP 1 – INPUT FORM */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="bg-secondary/15 p-2.5 rounded-full border border-secondary/20">
                        <FileText className="text-secondary" size={24} />
                      </div>
                      <h3 className="text-lg font-semibold text-secondary">
                        Step 1: Fill Out Your Bid Information
                      </h3>
                    </div>

                    <div className="space-y-2 text-sm text-muted-foreground pl-[3.5rem]">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-secondary"></div>
                        Company & Client Information
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-secondary"></div>
                        Scope of Work for Each Trade (Plumbing, Drywall, etc.)
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-secondary"></div>
                        Payment Terms & Timeline
                      </div>
                    </div>
                  </div>

                  {/* STEP 2 – OUTPUT DOCUMENT */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="bg-secondary/15 p-2.5 rounded-full border border-secondary/20">
                        <FileText className="text-secondary" size={24} />
                      </div>
                      <h3 className="text-lg font-semibold text-secondary">
                        Step 2: Receive a Professional Bid Document
                      </h3>
                    </div>

                    <div className="space-y-2 text-sm text-muted-foreground pl-[3.5rem]">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-secondary"></div>
                        A fully formatted Word document
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-secondary"></div>
                        Clean layout with your personalized information
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-secondary"></div>
                        Editable line items & payment summary
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-secondary"></div>
                        Professional, industry-standard language powered by AI
                      </div>
                    </div>
                  </div>

                  {/* STEP 3 – ENJOY */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="bg-secondary/15 p-2.5 rounded-full border border-secondary/20">
                        <FileText className="text-secondary" size={24} />
                      </div>
                      <h3 className="text-lg font-semibold text-secondary">
                        Step 3: Sit Back and Pretend You Did All the Work
                      </h3>
                    </div>

                    <div className="space-y-2 text-sm text-muted-foreground pl-[3.5rem]">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-secondary"></div>
                        Don’t worry, we won’t tell anyone our software did 90% of it.
                      </div>
                    </div>
                  </div>

                </CardContent>
              </Card>
            </div>


          </div>
          <div className="mt-12 text-center">
            <p className="text-muted-foreground max-w-3xl mx-auto">
              Built for contractors, remodelers, and trade professionals who are tired of typing the same bid 100 different ways.
            </p>
          </div>
        </div>
      </section>

      {/* Demo Video Section */}
      <section className="py-20 px-6 bg-card/30">
        <div className="container mx-auto max-w-5xl">
          <div className="text-center mb-10 space-y-4">
            <h2 className="text-4xl font-bold">Watch the demo</h2>
            <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
              See the workflow from project details to finished proposal in one quick walkthrough.
            </p>
          </div>

          <Card className="bg-card/80 backdrop-blur border-primary/20 shadow-xl shadow-primary/10 overflow-hidden">
            <CardContent className="p-4 sm:p-6">
              <div className="rounded-2xl overflow-hidden border border-border bg-black">
                <video
                  className="w-full h-auto"
                  controls
                  preload="metadata"
                  playsInline
                  poster={demoVideoThumbnail}
                >
                  <source src={DEMO_VIDEO_URL} type="video/mp4" />
                  Your browser does not support the video tag.
                </video>
              </div>
              <p className="text-sm text-muted-foreground mt-4 text-center">
                Having trouble with playback?{" "}
                <a
                  href={DEMO_VIDEO_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline underline-offset-4 hover:text-primary/80"
                >
                  Open the demo video in a new tab
                </a>
                .
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Vision Section */}
      <section className="py-20 px-6">
        <div className="container mx-auto max-w-4xl text-center">
          <h2 className="text-4xl font-bold mb-6">Our Vision</h2>
          <p className="text-xl text-muted-foreground leading-relaxed">
            Suros Logic Systems was built by people who know the contracting world firsthand. We&apos;re building an AI-driven document automation suite that helps service businesses create quotes faster, stay organized, and spend more time winning and running jobs.
          </p>
        </div>
      </section>

      {/* Problem Section */}
      <section className="py-20 px-6 bg-card/30">
        <div className="container mx-auto">
          <h2 className="text-4xl font-bold text-center mb-12">
            Bids are stealing your nights and weekends
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              "You spend hours writing and formatting the same scopes over and over.",
              "Inconsistent templates make your company look less professional.",
              "Some bids never even get sent because you run out of time.",
              "Every revision means more hours fighting with formatting."
            ].map((pain, idx) => (
              <Card key={idx} className="bg-card border-primary/30 hover:border-primary/60 hover:shadow-lg hover:shadow-primary/20 transition-all">
                <CardContent className="p-6">
                  <p className="text-muted-foreground">{pain}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Solution Section */}
      <section className="py-20 px-6">
        <div className="container mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">
              How it works
            </h2>
            <p className="text-muted-foreground text-lg">
              A straightforward workflow for turning project notes into a client-ready proposal.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              {
                step: "1",
                title: "Fill Out Simple Form",
                description: "You fill out a simple online form with project details and line items."
              },
              {
                step: "2",
                title: "AI Expands Content",
                description: "Our workflow organizes the scope and builds out the language in a clear, usable format."
              },
              {
                step: "3",
                title: "Generate Document",
                description: "You get a polished Word document your team can review, edit, and send."
              },
              {
                step: "4",
                title: "Instant Delivery",
                description: "Your proposal is delivered fast so you can move on to pricing, revisions, or sending."
              }
            ].map((step, idx) => (
              <div key={idx} className="relative">
                <div className="text-6xl font-bold text-primary/20 mb-4">{step.step}</div>
                <h3 className="text-xl font-semibold mb-3">{step.title}</h3>
                <p className="text-muted-foreground">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-6 bg-card/30">
        <div className="container mx-auto">
          <h2 className="text-4xl font-bold text-center mb-16">What you get</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: <Zap className="text-primary" size={32} />,
                title: "Industry-Tuned AI Prompts",
                description: "Workflows shaped around construction scopes instead of generic AI writing."
              },
              {
                icon: <FileText className="text-secondary" size={32} />,
                title: "Clean, Consistent Templates",
                description: "A reliable layout your team can use across projects and clients."
              },
              {
                icon: <Wrench className="text-primary" size={32} />,
                title: "Trade & Scope Line Items",
                description: "Plumbing, Electrical, Drywall, HVAC, Painting, Flooring, etc., with space for detailed scopes."
              },
              {
                icon: <FileText className="text-secondary" size={32} />,
                title: "Word Docs, Not Lock-in",
                description: "You get an editable Word document you can tweak, save, or reuse."
              },
              {
                icon: <Clock className="text-primary" size={32} />,
                title: "Time Savings",
                description: "Cut down admin work so more of your week goes to estimating and operations."
              },
              {
                icon: <Shield className="text-secondary" size={32} />,
                title: "No Complex Software",
                description: "Log in, complete the form, and review the finished document."
              }
            ].map((feature, idx) => (
              <Card key={idx} className="bg-card hover:bg-card/80 transition-colors border-border hover:border-primary/50">
                <CardContent className="p-6 space-y-4">
                  <div>{feature.icon}</div>
                  <h3 className="text-xl font-semibold">{feature.title}</h3>
                  <p className="text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Who It's For Section */}
      <section className="py-20 px-6">
        <div className="container mx-auto">
          <h2 className="text-4xl font-bold text-center mb-16">Perfect for...</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: <Home className="text-primary" size={48} />,
                title: "General Contractors & Remodelers",
                description: "Handle multiple bids daily with consistent, professional formatting."
              },
              {
                icon: <Wrench className="text-secondary" size={48} />,
                title: "Specialty Trades",
                description: "Plumbing, electrical, HVAC, flooring, tile, painting - we've got your scope covered."
              },
              {
                icon: <Hammer className="text-primary" size={48} />,
                title: "Estimators & Office Managers",
                description: "Free up your team to focus on project management, not document formatting."
              }
            ].map((item, idx) => (
              <Card key={idx} className="bg-gradient-to-br from-card to-card/50 border-primary/20 text-center">
                <CardContent className="p-8 space-y-4">
                  <div className="flex justify-center">{item.icon}</div>
                  <h3 className="text-xl font-semibold">{item.title}</h3>
                  <p className="text-muted-foreground">{item.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-20 px-6 bg-card/30">
        <div className="container mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Simple pricing that pays for itself</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            <Card className="relative overflow-visible bg-card border-primary/40 hover:border-primary/70 hover:shadow-xl hover:shadow-primary/30 transition-all">
              <CardContent className="p-8 space-y-6">
                <div className="pointer-events-none absolute -right-5 -top-5 z-10 rotate-[12deg] border border-primary/40 bg-primary px-4 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-primary-foreground shadow-lg shadow-primary/30">
                  Limited Offer:
                  <br />
                  1st month 50% off after trial
                </div>
                <h3 className="text-2xl font-bold text-primary">QuickStart Bid Templates</h3>
                <div className="space-y-2">
                  <div className="flex items-end gap-3">
                    <div className="text-2xl font-semibold text-muted-foreground line-through">$100/month</div>
                    <div className="text-3xl font-bold text-primary">$50<span className="text-lg text-muted-foreground">/month</span></div>
                  </div>
                  <p className="font-medium text-primary">30-day free trial included</p>
                </div>
                <ul className="space-y-3">
                  {[
                    "Access to prebuilt, optimized bid templates",
                    "Includes the key fields needed to produce a complete proposal",
                    "AI-tuned prompts for clean, detailed bids",
                    "Perfect for Immediate Use"
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
                    setCheckoutError("");
                    setExistingAccount(false);
                    setIsTrialDialogOpen(true);
                  }}
                  disabled={isCheckoutLoading}
                >
                  Start 30-Day Free Trial
                </Button>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-card to-secondary/10 border-secondary/40 hover:border-secondary/70 hover:shadow-xl hover:shadow-secondary/30 transition-all">
              <CardContent className="p-8 space-y-6">
                <h3 className="text-2xl font-bold text-secondary">Custom Workflow Build</h3>
                <div className="space-y-2">
                  <div className="text-3xl font-bold">Custom<span className="text-lg text-muted-foreground"> pricing</span></div>
                  <p className="text-muted-foreground">Setup & monthly based on complexity</p>
                </div>
                <ul className="space-y-3">
                  {[
                    "Everything from QuickStart subscription",
                    "Customized form matching your exact bid structure",
                    "Tailored prompts for your trades & regions",
                    "Multiple document types (bids, change orders)",
                    "Perfect for multi-location companies"
                  ].map((item, idx) => (
                    <li key={idx} className="flex items-start gap-3">
                      <Check className="text-secondary mt-1 flex-shrink-0" size={20} />
                      <span className="text-muted-foreground">{item}</span>
                    </li>
                  ))}
                </ul>
                <Button className="w-full bg-secondary hover:bg-secondary/90 text-secondary-foreground" size="lg">
                  <a href="https://calendly.com/astutemarketing-agency/new-meeting" target="_blank" rel="noopener noreferrer">
                    Schedule a Meeting
                  </a>
                </Button>
              </CardContent>
            </Card>
          </div>
          <p className="text-center text-muted-foreground mt-8 max-w-2xl mx-auto">
            All plans include onboarding support and access to improvements as we upgrade the system.
          </p>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="py-32 px-6 bg-gradient-to-br from-primary/20 via-background to-secondary/20">
        <div className="container mx-auto max-w-4xl text-center space-y-8">
          <h2 className="text-5xl font-bold">Ready to stop rewriting the same bid for the 100th time?</h2>
          <p className="text-xl text-muted-foreground">
            Book a quick walkthrough and see whether Suros Logic fits the way your team already works.
          </p>

          <Card className="bg-card/80 backdrop-blur">
            <CardContent className="p-8">
              <div className="space-y-4">
                <Button size="lg" className="w-full bg-primary hover:bg-primary/90 text-lg" asChild>
                  <a href="https://calendly.com/astutemarketing-agency/new-meeting" target="_blank" rel="noopener noreferrer">
                    Book My Demo <ArrowRight className="ml-2" />
                  </a>
                </Button>
              </div>
              <p className="mt-6 text-sm text-muted-foreground">
                <a onClick={() => window.open("/sample_bid.pdf", "_blank")} className="underline hover:text-primary">See Sample Bid</a>
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <Dialog open={isTrialDialogOpen} onOpenChange={setIsTrialDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Enter your email to get started.</DialogTitle>
            <DialogDescription>
              We&apos;ll guide you through the next step.
            </DialogDescription>
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

          {checkoutError && (
            <p className="text-sm text-red-500">{checkoutError}</p>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                if (isCheckoutLoading) return;
                setCheckoutError("");
                setExistingAccount(false);
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
              <Button className="bg-primary hover:bg-primary/90" onClick={makePayment} disabled={isCheckoutLoading}>
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

      <footer className="py-8 px-6 border-t border-border">
        <div className="container mx-auto text-center space-y-4">
          <img src={surosLogo} alt="Suros Logic Systems" className="h-10 mx-auto opacity-70" />
          <p className="text-muted-foreground">© 2026 Suros Logic Systems. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
