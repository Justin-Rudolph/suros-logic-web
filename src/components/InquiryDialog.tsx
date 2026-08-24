import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { getFunctionsBaseUrl } from "@/lib/functionsApi";
import type { ButtonProps } from "@/components/ui/button";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Same live "XXX-XXX-XXXX" formatting used in the bid form.
const formatPhone = (value: string) => {
  const digits = value.replace(/\D/g, "").slice(0, 10);

  if (digits.length <= 3) return digits;
  if (digits.length <= 6) {
    return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  }

  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
};

const EMPTY_FORM = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  companyName: "",
  website: "",
  companyDescription: "",
};

type InquiryForm = typeof EMPTY_FORM;

/**
 * A "Get More Info" trigger button + dialog for the public landing page.
 * Submits to the `submitInquiry` Cloud Function — no login required. That
 * endpoint validates the payload, writes the record to Firestore via the
 * Admin SDK, and emails a notification, all as a direct result of this
 * request (see functions/routes/submitInquiry.js).
 */
export function InquiryDialog({
  triggerClassName,
  triggerVariant = "outline",
  triggerSize = "sm",
}: {
  triggerClassName?: string;
  triggerVariant?: "outline" | "default";
  triggerSize?: ButtonProps["size"];
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<InquiryForm>(EMPTY_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const updateField = (field: keyof InquiryForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const updatePhone = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, phone: formatPhone(e.target.value) }));
  };

  const resetAndClose = () => {
    setOpen(false);
    // Delay the reset so the dialog doesn't visibly blank out mid-close.
    setTimeout(() => {
      setForm(EMPTY_FORM);
      setError("");
      setSubmitted(false);
    }, 200);
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;

    const firstName = form.firstName.trim();
    const lastName = form.lastName.trim();
    const email = form.email.trim().toLowerCase();
    const companyName = form.companyName.trim();

    const missingFields = [
      !firstName && "First Name",
      !lastName && "Last Name",
      !email && "Email",
      !companyName && "Company Name",
    ].filter((field): field is string => Boolean(field));

    if (missingFields.length > 0) {
      const verb = missingFields.length === 1 ? "is" : "are";
      const list =
        missingFields.length <= 2
          ? missingFields.join(" and ")
          : `${missingFields.slice(0, -1).join(", ")}, and ${missingFields.at(-1)}`;
      setError(`${list} ${verb} required.`);
      return;
    }

    if (!EMAIL_PATTERN.test(email)) {
      setError("Enter a valid email address.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const phone = form.phone.trim();
      const website = form.website.trim();
      const companyDescription = form.companyDescription.trim();

      const response = await fetch(`${getFunctionsBaseUrl()}/submitInquiry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName,
          email,
          companyName,
          phone,
          website,
          companyDescription,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setError(data?.error || "Something went wrong submitting your info. Please try again.");
        return;
      }

      setSubmitted(true);
      setTimeout(resetAndClose, 5000);
    } catch (err) {
      console.error("Inquiry submission error:", err);
      setError("Something went wrong submitting your info. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          resetAndClose();
          return;
        }
        setOpen(next);
      }}
    >
      <Button
        size={triggerSize}
        variant={triggerVariant}
        className={triggerClassName}
        onClick={() => setOpen(true)}
      >
        Get More Info
      </Button>

      <DialogContent className="w-[calc(100%_-_2rem)] max-w-md max-h-[85vh] overflow-y-auto rounded-lg">
        {submitted ? (
          <div className="text-center space-y-6">
            <div className="space-y-2">
              <DialogTitle>Thanks — we&apos;ll be in touch!</DialogTitle>
              <DialogDescription>
                We got your info and someone from our team will reach out shortly.
              </DialogDescription>
            </div>
            <Button className="bg-primary hover:bg-primary/90" onClick={resetAndClose}>
              Okay
            </Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Tell us about your business</DialogTitle>
              <DialogDescription>
                Share a few details and we&apos;ll follow up with more information.
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="inquiry-first-name">
                  First Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="inquiry-first-name"
                  value={form.firstName}
                  onChange={updateField("firstName")}
                  disabled={isSubmitting}
                  autoComplete="given-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="inquiry-last-name">
                  Last Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="inquiry-last-name"
                  value={form.lastName}
                  onChange={updateField("lastName")}
                  disabled={isSubmitting}
                  autoComplete="family-name"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="inquiry-email">
                Email <span className="text-red-500">*</span>
              </Label>
              <Input
                id="inquiry-email"
                type="email"
                value={form.email}
                onChange={updateField("email")}
                disabled={isSubmitting}
                autoComplete="email"
                placeholder="you@company.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="inquiry-phone">Phone (optional)</Label>
              <Input
                id="inquiry-phone"
                type="tel"
                value={form.phone}
                onChange={updatePhone}
                disabled={isSubmitting}
                autoComplete="tel"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="inquiry-company-name">
                Company Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="inquiry-company-name"
                value={form.companyName}
                onChange={updateField("companyName")}
                disabled={isSubmitting}
                autoComplete="organization"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="inquiry-website">Website (optional)</Label>
              <Input
                id="inquiry-website"
                value={form.website}
                onChange={updateField("website")}
                disabled={isSubmitting}
                placeholder="https://yourcompany.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="inquiry-company-description">Company Description (optional)</Label>
              <Textarea
                id="inquiry-company-description"
                value={form.companyDescription}
                onChange={updateField("companyDescription")}
                disabled={isSubmitting}
                rows={3}
                placeholder="What does your company do?"
              />
            </div>

            {error && <p className="text-sm text-red-500">{error}</p>}

            <p className="text-xs text-muted-foreground leading-snug">
              By submitting, you agree to be contacted by Suros Logic Systems by email or phone.
              See our{" "}
              <Link to="/privacy" state={{ fromLanding: true }} className="underline underline-offset-4 hover:text-primary">
                Privacy Policy
              </Link>{" "}
              and{" "}
              <Link to="/terms" state={{ fromLanding: true }} className="underline underline-offset-4 hover:text-primary">
                Terms
              </Link>.
            </p>

            <DialogFooter>
              <Button variant="outline" onClick={resetAndClose} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button className="bg-primary hover:bg-primary/90" onClick={handleSubmit} disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  "Submit"
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
