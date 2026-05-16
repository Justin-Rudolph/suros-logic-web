import { useEffect } from "react";
import { matchPath, useLocation } from "react-router-dom";

import { useAuth } from "@/context/AuthContext";
import { trackPageView } from "@/lib/firebase";

const SITE_NAME = "Suros Logic Systems";

const routes = [
  { path: "/", title: "AI-Powered Bid Creation" },
  { path: "/auth", title: "Login" },
  { path: "/forgot-password", title: "Forgot Password" },
  { path: "/success", title: "Payment Success" },
  { path: "/cancel", title: "Payment Canceled" },
  { path: "/privacy", title: "Privacy Policy" },
  { path: "/terms", title: "Terms and Conditions" },
  { path: "/dashboard", title: "Dashboard" },
  { path: "/billing", title: "Billing" },
  { path: "/plan-analyzer", title: "Plan Analyzer" },
  { path: "/plan-analyzer/:projectId", title: "Plan Analysis" },
  { path: "/edit-profile", title: "Edit Profile" },
  { path: "/change-password", title: "Change Password" },
  { path: "/form/bid_form", title: "Bid Form" },
  { path: "/form/change_order", title: "Change Order Form" },
  { path: "/form/test", title: "Test Bid Form" },
  { path: "/view-bids", title: "Bids" },
  { path: "/bids/history", title: "Bids" },
  { path: "/bids", title: "Bids" },
  { path: "/bids/:bidId", title: "Bid Workspace" },
  { path: "/bids/:bidId/form", title: "Bid Form" },
  { path: "/bids/:bidId/bid-proposal", title: "Bid Proposal" },
  { path: "/bids/:bidId/change-orders", title: "Change Orders" },
  {
    path: "/bids/:bidId/change-order-proposal",
    title: "Change Order Proposals",
  },
  { path: "/bids/:bidId/project-files", title: "Project Files" },
  { path: "/bids/:bidId/change-orders/new", title: "New Change Order" },
  {
    path: "/bids/:bidId/change-orders/:changeOrderId/form",
    title: "Change Order Form",
  },
  {
    path: "/bids/:bidId/change-orders/:changeOrderId/proposal",
    title: "Change Order Proposal",
  },
  { path: "/bid-editors/history", title: "Bids" },
  { path: "/bid-editors/:bidEditorId", title: "Bids" },
  { path: "/release-notes", title: "Release Notes" },
];

const getPageTitle = (pathname: string) => {
  const route = routes.find(({ path }) =>
    matchPath({ path, end: true }, pathname)
  );

  return `${route?.title ?? "Page Not Found"} | ${SITE_NAME}`;
};

export default function AnalyticsTracker() {
  const location = useLocation();
  const { loading, user } = useAuth();

  useEffect(() => {
    if (location.pathname === "/" && (loading || user)) {
      return;
    }

    const pageTitle = getPageTitle(location.pathname);
    document.title = pageTitle;

    void trackPageView(`${location.pathname}${location.hash}`, pageTitle);
  }, [loading, location.hash, location.pathname, user]);

  return null;
}
