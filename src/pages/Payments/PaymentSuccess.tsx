import { Button } from "@/components/ui/button";
import { CheckCircle, Mail } from "lucide-react";
import surosLogo from "@/assets/suros-logo-new.png";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";
import { getAuth } from "firebase/auth";
import { useAuth } from "@/context/AuthContext";
import { getFunctionsBaseUrl } from "@/lib/functionsApi";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const PaymentSuccess = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const { user, refreshProfile } = useAuth();

  const sessionId = searchParams.get("session_id");

  const [email, setEmail] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justCreated, setJustCreated] = useState(false);
  const [stripeSubscriptionStatus, setStripeSubscriptionStatus] = useState<string | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [refreshingProfile, setRefreshingProfile] = useState(false);
  const isTrialing = stripeSubscriptionStatus === "trialing";

  const refreshUntilSubscribed = useCallback(async () => {
    setRefreshingProfile(true);

    try {
      const auth = getAuth();

      if (!auth.currentUser) {
        return null;
      }

      await auth.currentUser.reload();

      for (let attempt = 0; attempt < 8; attempt += 1) {
        const nextProfile = await refreshProfile();

        if (nextProfile?.isSubscribed === true) {
          return nextProfile;
        }

        await wait(1000);
      }

      return await refreshProfile();
    } finally {
      setRefreshingProfile(false);
    }
  }, [refreshProfile]);

  useEffect(() => {
    const fetchEmail = async () => {
      if (!sessionId) {
        setError("Missing checkout session.");
        setLoadingSession(false);
        return;
      }

      try {
        const res = await fetch(`${getFunctionsBaseUrl()}/stripe/session/${sessionId}`);

        if (!res.ok) {
          throw new Error(`API error ${res.status}`);
        }

        const data = await res.json();

        if (!data.email) {
          throw new Error("No email found.");
        }

        setEmail(data.email);
        setEmailSent(true);
        setJustCreated(data.justCreated === true);
        setStripeSubscriptionStatus(data.stripeSubscriptionStatus || null);

        await refreshUntilSubscribed();

      } catch (err) {
        console.error("Session fetch failed:", err);
        setError("Something went wrong. Please contact support.");
      } finally {
        setLoadingSession(false);
      }
    };

    fetchEmail();
  }, [refreshUntilSubscribed, sessionId]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="max-w-lg w-full text-center space-y-6">

        <img src={surosLogo} alt="Suros Logic" className="h-14 mx-auto" />

        <CheckCircle className="mx-auto text-primary" size={72} />

        <h1 className="text-4xl font-bold">
          {loadingSession
            ? "Confirming Checkout..."
            : isTrialing
              ? "Trial Started"
              : "Payment Successful"}
        </h1>

        <p className="text-muted-foreground text-lg">
          {loadingSession
            ? "Hang tight while we confirm your subscription details."
            : isTrialing
              ? "Your 30-day free trial is active."
              : "Your subscription is active."}
        </p>

        {justCreated && email && (
          <div className="flex items-center justify-center gap-2 text-primary font-medium">
            <Mail size={18} />
            <span>
              If this is your first time, check your email (<strong>{email}</strong>) to set your password
            </span>
          </div>
        )}

        {error && (
          <p className="text-red-500 text-sm">
            {error}
          </p>
        )}

        <Button
          size="lg"
          className="w-full bg-primary hover:bg-primary/90"
          disabled={refreshingProfile}
          onClick={async () => {
            if (user) {
              await refreshUntilSubscribed();
              navigate("/dashboard"); // ✅ FIXED
            } else {
              navigate("/auth");
            }
          }}
        >
          {refreshingProfile
            ? "Updating Subscription..."
            : user
              ? "Go to Dashboard"
              : "Go to Login"}
        </Button>

      </div>
    </div>
  );
};

export default PaymentSuccess;
