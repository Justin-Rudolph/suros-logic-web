import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useNavigate } from "react-router-dom";
import "@/styles/gradients.css";
import { getFunctionsBaseUrl } from "@/lib/functionsApi";

export default function ManageSubscription() {
    const { profile, user } = useAuth();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const navigate = useNavigate();

    const hasStripeCustomer =
        Boolean(profile?.stripeCustomerId) &&
        profile?.stripeCustomerId?.trim() !== "";
    const isTrialing = profile?.isSubscribed === true && profile?.stripeSubscriptionStatus === "trialing";
    const hasActiveSubscription =
        profile?.isSubscribed === true &&
        hasStripeCustomer;

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
            const token = await user?.getIdToken();

            if (!token) {
                throw new Error("Missing auth token");
            }

            const res = await fetch(`${getFunctionsBaseUrl()}/stripe/portal`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
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
            const token = await user?.getIdToken();

            if (!token) {
                throw new Error("Missing auth token");
            }

            const res = await fetch(`${getFunctionsBaseUrl()}/stripe/checkout`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({}),
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
                    {isTrialing
                        ? "You are currently on a free trial. Manage your subscription, payment method, and invoices."
                        : hasActiveSubscription
                        ? "Manage your subscription, payment method, and invoices."
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
                            : isTrialing
                                ? "Manage Trial"
                                : "Manage Subscription"}
                    </button>
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
