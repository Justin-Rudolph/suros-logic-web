import { Button } from "@/components/ui/button";
import { CheckCircle, Mail } from "lucide-react";
import surosLogo from "@/assets/suros-logo-new.png";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { getAuth } from "firebase/auth";
import { useAuth } from "@/context/AuthContext";

const PaymentSuccess = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const { user } = useAuth();

  const sessionId = searchParams.get("session_id");

  const [email, setEmail] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justCreated, setJustCreated] = useState(false);

  const API_BASE = import.meta.env.DEV
    ? "http://127.0.0.1:5001/suros-logic/us-central1"
    : "https://us-central1-suros-logic.cloudfunctions.net";

  useEffect(() => {
    const fetchEmail = async () => {
      if (!sessionId) {
        setError("Missing checkout session.");
        return;
      }

      try {
        const res = await fetch(`${API_BASE}/stripe/session/${sessionId}`);

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

        const auth = getAuth();
        if (auth.currentUser) {
          await auth.currentUser.reload();
        }

      } catch (err) {
        console.error("Session fetch failed:", err);
        setError("Something went wrong. Please contact support.");
      }
    };

    fetchEmail();
  }, [sessionId, API_BASE]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="max-w-lg w-full text-center space-y-6">

        <img src={surosLogo} alt="Suros Logic" className="h-14 mx-auto" />

        <CheckCircle className="mx-auto text-primary" size={72} />

        <h1 className="text-4xl font-bold">Payment Successful</h1>

        <p className="text-muted-foreground text-lg">
          Your subscription is active.
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
          onClick={() => {
            if (user) {
              navigate("/dashboard"); // ✅ FIXED
            } else {
              navigate("/auth");
            }
          }}
        >
          {user ? "Go to Dashboard" : "Go to Login"}
        </Button>

      </div>
    </div>
  );
};

export default PaymentSuccess;