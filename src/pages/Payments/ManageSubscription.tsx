import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useNavigate } from "react-router-dom";
import "@/styles/gradients.css";

export default function ManageSubscription() {
    const { profile } = useAuth();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const navigate = useNavigate();

    const hasActiveSubscription =
        profile?.isSubscribed === true &&
        profile?.stripeCustomerId &&
        profile.stripeCustomerId.trim() !== "";

    // ✅ NEW: Free trial state
    const isFreeTrial =
        profile?.isSubscribed === true &&
        (!profile?.stripeCustomerId || profile.stripeCustomerId.trim() === "");

    const API_BASE = import.meta.env.DEV
        ? "http://127.0.0.1:5001/suros-logic/us-central1"
        : "https://us-central1-suros-logic.cloudfunctions.net";

    /* ----------------------------------------------------------
       OPEN STRIPE BILLING PORTAL (ACTIVE SUBS)
    ---------------------------------------------------------- */
    const openBillingPortal = async () => {
        if (!profile?.stripeCustomerId || profile.stripeCustomerId.trim() === "") {
            setError("Unable to locate billing information.");
            return;
        }

        try {
            setLoading(true);
            setError("");

            const res = await fetch(`${API_BASE}/stripe/portal`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    stripeCustomerId: profile.stripeCustomerId,
                }),
            });

            if (!res.ok) {
                throw new Error(`Portal error: ${res.status}`);
            }

            const data = await res.json();

            if (!data.url) {
                throw new Error("Missing portal URL");
            }

            window.location.href = data.url;

        } catch (err) {
            console.error(err);
            setError("Unable to open billing portal.");
        } finally {
            setLoading(false);
        }
    };

    /* ----------------------------------------------------------
       START NEW SUBSCRIPTION
    ---------------------------------------------------------- */
    const startNewSubscription = async () => {
        try {
            setLoading(true);
            setError("");

            const res = await fetch(`${API_BASE}/stripe/checkout`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email: profile?.email,
                    uid: profile?.uid,
                }),
            });

            if (!res.ok) {
                throw new Error(`Checkout error: ${res.status}`);
            }

            const data = await res.json();

            if (!data.url) {
                throw new Error("Missing checkout URL");
            }

            window.location.href = data.url;

        } catch (err) {
            console.error(err);
            setError("Unable to start subscription.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="suros-gradient min-h-screen flex items-center justify-center px-6">

            <button
                onClick={() => navigate("/dashboard")}
                style={{
                    position: "fixed",
                    top: "20px",
                    left: "20px",
                    background: "#1e73be",
                    color: "#fff",
                    padding: "10px 18px",
                    fontSize: "15px",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontWeight: 600,
                    border: "none",
                    zIndex: 10,
                }}
            >
                ← Back
            </button>

            <div className="bg-white text-gray-900 rounded-2xl shadow-xl max-w-md w-full p-8 text-center">

                <h1 className="text-2xl font-bold mb-3">
                    Subscription & Billing
                </h1>

                <p className="text-gray-600 mb-6">
                    {hasActiveSubscription
                        ? "Manage your subscription, payment method, and invoices."
                        : isFreeTrial
                            ? "You are currently on a free trial."
                            : "Your subscription is inactive. Start a new subscription below."}
                </p>

                {error && (
                    <p className="text-red-500 mb-4">{error}</p>
                )}

                {/* ACTIVE SUB */}
                {hasActiveSubscription ? (
                    <button
                        onClick={openBillingPortal}
                        disabled={loading}
                        className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition disabled:opacity-70"
                    >
                        {loading
                            ? "Opening Billing Portal..."
                            : "Manage Subscription"}
                    </button>
                ) : isFreeTrial ? (
                    /* ✅ FREE TRIAL (NO BUTTON) */
                    <div className="w-full py-3 bg-green-600 text-white rounded-xl font-semibold">
                        Free Trial Active
                    </div>
                ) : (
                    /* NO SUB */
                    <button
                        onClick={startNewSubscription}
                        disabled={loading}
                        className="w-full py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold transition disabled:opacity-70"
                    >
                        {loading
                            ? "Redirecting to Checkout..."
                            : "Start Subscription"}
                    </button>
                )}

            </div>
        </div>
    );
}