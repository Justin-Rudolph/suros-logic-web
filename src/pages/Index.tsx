import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, Check, FileText, Zap, Shield, Clock, Wrench, Home, Hammer } from "lucide-react";
import { useState } from "react";

const Index = () => {
  const [formData, setFormData] = useState({
    name: "",
    company: "",
    email: "",
    phone: "",
    trades: "",
    bidsPerMonth: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Demo request:", formData);
    // Handle form submission
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Navigation */}
      <nav className="fixed top-0 w-full bg-background/80 backdrop-blur-md border-b border-border z-50">
        <div className="container mx-auto px-6 py-4 flex justify-between items-center">
          <div className="text-2xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            Suros Logic Systems
          </div>
          <Button size="lg" className="bg-primary hover:bg-primary/90">
            Book a Free Demo
          </Button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6">
        <div className="container mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-8 animate-fade-in">
              <h1 className="text-5xl lg:text-7xl font-bold leading-tight">
                AI that writes your{" "}
                <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                  bids for you
                </span>
              </h1>
              <p className="text-xl text-muted-foreground">
                Suros Logic Systems turns a simple project form into a fully formatted, 
                professional bid document – in minutes, not hours.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Button size="lg" className="bg-primary hover:bg-primary/90 text-lg">
                  Book a Free 15-Min Demo <ArrowRight className="ml-2" />
                </Button>
                <Button size="lg" variant="outline" className="text-lg">
                  See Sample Bid
                </Button>
              </div>
            </div>
            <div className="relative animate-fade-in" style={{ animationDelay: "0.2s" }}>
              <Card className="bg-card/50 backdrop-blur border-primary/20">
                <CardContent className="p-8 space-y-6">
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-primary">Bid Input Form</h3>
                    <div className="space-y-2 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-primary"></div>
                        Company Name, Client Name
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-primary"></div>
                        Scope of Work, Plumbing, Drywall
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-primary"></div>
                        Payment Terms
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-center py-4">
                    <ArrowRight className="text-secondary" size={32} />
                  </div>
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-secondary">Professional Bid Document</h3>
                    <div className="bg-background/50 p-4 rounded-lg border border-secondary/20">
                      <FileText className="text-secondary mb-2" size={24} />
                      <p className="text-xs text-muted-foreground">
                        Fully formatted Word document ready to send
                      </p>
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
              <Card key={idx} className="bg-card border-destructive/20 hover:border-destructive/40 transition-colors">
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
              Your bid, fully written, from one simple form
            </h2>
            <p className="text-muted-foreground text-lg">
              No AI experience required. We handle the prompts, templates, and formatting for you.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              {
                step: "1",
                title: "Fill Out Simple Form",
                description: "Contractor fills out a simple online form with project details and line items."
              },
              {
                step: "2",
                title: "AI Expands Content",
                description: "Optimized AI prompts expand and structure the content like a human-written bid."
              },
              {
                step: "3",
                title: "Generate Document",
                description: "The system generates a beautifully formatted Word document, keeping your style consistent."
              },
              {
                step: "4",
                title: "Instant Delivery",
                description: "The bid is emailed to you instantly, ready to edit or send to your client."
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
          <h2 className="text-4xl font-bold text-center mb-16">Built for real-world contracting</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: <Zap className="text-primary" size={32} />,
                title: "Contractor-Tuned AI Prompts",
                description: "AI workflows specifically optimized for contracting bids, not generic text."
              },
              {
                icon: <FileText className="text-secondary" size={32} />,
                title: "Clean, Consistent Templates",
                description: "Same professional structure every time across all bids."
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
                description: "Replace hours of typing with a few minutes of form filling."
              },
              {
                icon: <Shield className="text-secondary" size={32} />,
                title: "No Complex Software",
                description: "Just log in, fill out the form, and get your bid."
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
            <Card className="bg-card border-primary/50 hover:shadow-lg hover:shadow-primary/20 transition-all">
              <CardContent className="p-8 space-y-6">
                <h3 className="text-2xl font-bold text-primary">QuickStart Bid Templates</h3>
                <div className="space-y-2">
                  <div className="text-3xl font-bold">$150<span className="text-lg text-muted-foreground">/month</span></div>
                  <p className="text-muted-foreground">One-time setup: $300</p>
                </div>
                <ul className="space-y-3">
                  {[
                    "Access to prebuilt, optimized bid templates",
                    "Standard form with common contractor fields",
                    "AI-tuned prompts for clean, detailed bids",
                    "Ideal for ready-to-use system"
                  ].map((item, idx) => (
                    <li key={idx} className="flex items-start gap-3">
                      <Check className="text-primary mt-1 flex-shrink-0" size={20} />
                      <span className="text-muted-foreground">{item}</span>
                    </li>
                  ))}
                </ul>
                <Button className="w-full bg-primary hover:bg-primary/90" size="lg">
                  Get Started
                </Button>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-card to-primary/5 border-secondary/50 hover:shadow-lg hover:shadow-secondary/20 transition-all">
              <CardContent className="p-8 space-y-6">
                <h3 className="text-2xl font-bold text-secondary">Custom Workflow Build</h3>
                <div className="space-y-2">
                  <div className="text-3xl font-bold">Custom<span className="text-lg text-muted-foreground"> pricing</span></div>
                  <p className="text-muted-foreground">Setup & monthly based on complexity</p>
                </div>
                <ul className="space-y-3">
                  {[
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
                  Contact Sales
                </Button>
              </CardContent>
            </Card>
          </div>
          <p className="text-center text-muted-foreground mt-8 max-w-2xl mx-auto">
            All plans include onboarding support and access to improvements as we upgrade the system.
          </p>
        </div>
      </section>

      {/* Custom Automation Section */}
      <section className="py-20 px-6">
        <div className="container mx-auto max-w-4xl text-center">
          <h2 className="text-4xl font-bold mb-6">Beyond bids: full quoting and automation systems</h2>
          <p className="text-xl text-muted-foreground mb-8">
            Suros Logic Systems can also build tailored quoting systems that mirror your existing Excel/Word bids, 
            and automated workflows that push bid data into CRMs, email follow-ups, and project management tools.
          </p>
          <Button size="lg" variant="outline" className="border-primary/50 hover:bg-primary/10">
            Talk to us about custom automation <ArrowRight className="ml-2" />
          </Button>
        </div>
      </section>

      {/* Results Section */}
      <section className="py-20 px-6 bg-card/30">
        <div className="container mx-auto">
          <div className="grid md:grid-cols-3 gap-8 text-center">
            {[
              {
                title: "Save hours on every bid",
                description: "Stop spending nights and weekends on formatting"
              },
              {
                title: "More consistent proposals",
                description: "Professional structure across every bid you send"
              },
              {
                title: "Focus on what matters",
                description: "Free your team to focus on jobs, not documents"
              }
            ].map((result, idx) => (
              <div key={idx} className="space-y-4">
                <div className="text-5xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                  {idx + 1}
                </div>
                <h3 className="text-2xl font-semibold">{result.title}</h3>
                <p className="text-muted-foreground">{result.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* About Section */}
      <section className="py-20 px-6">
        <div className="container mx-auto max-w-4xl text-center">
          <h2 className="text-4xl font-bold mb-6">Our Vision</h2>
          <p className="text-xl text-muted-foreground leading-relaxed">
            Suros Logic Systems was created by people who live in the contracting world. We know how much time 
            goes into every quote, every bid, every revision. Our vision is an AI-driven document automation suite 
            that handles not just bids, but contracts, change orders, and more – across industries like construction, 
            legal, and real estate.
          </p>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="py-32 px-6 bg-gradient-to-br from-primary/20 via-background to-secondary/20">
        <div className="container mx-auto max-w-4xl text-center space-y-8">
          <h2 className="text-5xl font-bold">Ready to stop rewriting the same bid for the 100th time?</h2>
          <p className="text-xl text-muted-foreground">
            Book a free 15-minute demo and see how Suros Logic Systems can automate your next bid.
          </p>
          
          <Card className="bg-card/80 backdrop-blur">
            <CardContent className="p-8">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <Input 
                    placeholder="Name" 
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    required
                  />
                  <Input 
                    placeholder="Company" 
                    value={formData.company}
                    onChange={(e) => setFormData({...formData, company: e.target.value})}
                    required
                  />
                  <Input 
                    type="email" 
                    placeholder="Email" 
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    required
                  />
                  <Input 
                    type="tel" 
                    placeholder="Phone" 
                    value={formData.phone}
                    onChange={(e) => setFormData({...formData, phone: e.target.value})}
                    required
                  />
                </div>
                <Input 
                  placeholder="What trades do you do?" 
                  value={formData.trades}
                  onChange={(e) => setFormData({...formData, trades: e.target.value})}
                  required
                />
                <Input 
                  placeholder="Approx. bids per month" 
                  value={formData.bidsPerMonth}
                  onChange={(e) => setFormData({...formData, bidsPerMonth: e.target.value})}
                  required
                />
                <Button type="submit" size="lg" className="w-full bg-primary hover:bg-primary/90 text-lg">
                  Book My Demo <ArrowRight className="ml-2" />
                </Button>
              </form>
              <p className="mt-6 text-sm text-muted-foreground">
                <a href="#" className="underline hover:text-primary">Request a Sample Bid</a>
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-border">
        <div className="container mx-auto text-center text-muted-foreground">
          <p>© 2024 Suros Logic Systems. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
