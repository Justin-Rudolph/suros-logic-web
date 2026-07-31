import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useNavigate } from "react-router-dom";
import "@/styles/gradients.css";
import "./ManageSubscription.css";
import { getFunctionsBaseUrl } from "@/lib/functionsApi";
import { isMember } from "@/lib/account";

export default function ManageSubscription() {
    const { profile, user, refreshProfile } = useAuth();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [showEndTrialConfirm, setShowEndTrialConfirm] = useState(false);
    const navigate = useNavigate();

    // Members ride the owner's single subscription — they never manage billing.
    const member = isMember(profile);

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

    /* ----------------------------------------------------------
       END TRIAL EARLY — bills now and lifts the analysis limit
    ---------------------------------------------------------- */
    const endTrial = async () => {
        try {
            setLoading(true);
            setError("");
            const token = await user?.getIdToken();

            if (!token) {
                throw new Error("Missing auth token");
            }

            const res = await fetch(`${getFunctionsBaseUrl()}/stripe/end-trial`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({}),
            });

            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                // The server writes copy meant for the account owner — a
                // declined card or a missing payment method both need saying
                // plainly rather than collapsing into "something went wrong".
                throw new Error(data?.error || "Unable to end your trial.");
            }

            setShowEndTrialConfirm(false);

            // The endpoint already wrote the new status, so this picks up the
            // raised analysis limit without waiting on the Stripe webhook.
            await refreshProfile();
        } catch (err) {
            console.error(err);
            setError(
                err instanceof Error ? err.message : "Unable to end your trial."
            );
            setShowEndTrialConfirm(false);

            // A declined card still moves the subscription off "trialing" on
            // Stripe's side, and the server has already written that. Without
            // this the page keeps offering to end a trial that no longer
            // exists, and the retry comes back as a confusing 409.
            await refreshProfile();
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

                {member ? (
                    <p className="text-gray-600">
                        Your access is part of your team's plan. Billing and
                        subscription are managed by your account owner.
                    </p>
                ) : (
                <>
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
                    <div className="space-y-3">
                        {/* A trial caps plan analyses well below the paid plan,
                            and nothing else in the app offers a way off it. */}
                        {isTrialing && (
                            <button
                                onClick={() => setShowEndTrialConfirm(true)}
                                disabled={loading}
                                className="w-full py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold transition disabled:opacity-70"
                            >
                                End trial and start full plan
                            </button>
                        )}

                        <button
                            onClick={openBillingPortal}
                            disabled={loading}
                            className={`w-full py-3 rounded-xl font-semibold transition disabled:opacity-70 ${isTrialing
                                ? "bg-white text-gray-900 border border-gray-300 hover:bg-gray-50"
                                : "bg-blue-600 hover:bg-blue-700 text-white"
                                }`}
                        >
                            {loading
                                ? "Opening Billing Portal..."
                                : isTrialing
                                    ? "Manage Trial"
                                    : "Manage Subscription"}
                        </button>
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
                </>
                )}

            </div>

            {/* Charging a card is not a one-click action — spell out what
                happens before it does. */}
            {showEndTrialConfirm && (
                <div className="billing-modal-overlay">
                    <div className="billing-modal">
                        <h2>End trial and start full plan</h2>

                        <p>
                            Your card will be charged today and your remaining
                            trial days end now. Your monthly plan analyses go
                            from 1 to 3, and any team seats you have are billed
                            on the same invoice.
                        </p>

                        <div className="billing-modal-actions">
                            <button
                                className="secondary"
                                onClick={() => setShowEndTrialConfirm(false)}
                                disabled={loading}
                            >
                                Cancel
                            </button>

                            <button
                                className="primary"
                                onClick={endTrial}
                                disabled={loading}
                            >
                                {loading ? "Ending trial..." : "End trial and pay"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
