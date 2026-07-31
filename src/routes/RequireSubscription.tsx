import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

/**
 * Guards routes that create new paid work (new bid / new change order).
 *
 * Every entry point already hides these behind a billing modal, but nothing
 * stopped a direct navigation to the URL, and the forms carry no paywall of
 * their own — so an inactive account could reach them and bypass the
 * subscription. Plan Analyzer's "Add to New Bid" was one such doorway.
 *
 * Deliberately scoped to CREATION only. Viewing and editing existing work stays
 * open, matching how the dashboard still offers "View Existing Plans" and how
 * the bid workspace lets you read a bid while inactive.
 *
 * Must be nested inside ProtectedRoute, which handles the signed-out case.
 */
export default function RequireSubscription({
  children,
}: {
  children: JSX.Element;
}) {
  const { profile, loading } = useAuth();
  const location = useLocation();

  // Wait for the profile to resolve: `profile.isSubscribed` reads as undefined
  // mid-load, which would bounce an active subscriber to billing.
  if (loading || !profile) return null;

  if (profile.isSubscribed !== true) {
    return (
      <Navigate
        to="/billing"
        replace
        state={{ from: location.pathname, reason: "subscription-required" }}
      />
    );
  }

  return children;
}
