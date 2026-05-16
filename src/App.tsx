import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import AnalyticsTracker from "@/components/AnalyticsTracker";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

import BidForm from "./pages/Form/BidForm";
import ChangeOrderForm from "./pages/Form/ChangeOrderForm";
import TestBidForm from "./pages/Form/TestBidForm";

import Login from "./pages/Auth/Login";

import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./routes/ProtectedRoute";

import Dashboard from "./pages/Dashboard/Dashboard";
import PlanAnalyzer from "./pages/PlanAnalyzer/PlanAnalyzer";
import PlanAnalyzerRun from "./pages/PlanAnalyzer/PlanAnalyzerRun";
import EditProfile from "./pages/Profile/EditProfile";
import ChangePassword from "./pages/Profile/ChangePassword";
import ForgotPassword from "./pages/Auth/ForgotPassword";

import PrivacyPolicy from "./pages/Legal/PrivacyPolicy";
import TermsConditions from "./pages/Legal/TermsConditions";

import ProjectFiles from "./pages/Bids/ProjectFiles";
import MyBids from "./pages/Bids/MyBids";
import BidWorkspaceLayout from "./pages/Bids/BidWorkspaceLayout";
import BidWorkspaceOverview from "./pages/Bids/BidWorkspaceOverview";
import BidWorkspaceChangeOrders from "./pages/Bids/BidWorkspaceChangeOrders";
import BidWorkspaceChangeOrderProposals from "./pages/Bids/BidWorkspaceChangeOrderProposals";
import BidFormProposalEditor from "./pages/Proposals/BidFormProposalEditor";
import ChangeOrderProposalEditor from "./pages/Proposals/ChangeOrderProposalEditor";

import PaymentSuccess from "./pages/Payments/PaymentSuccess";
import PaymentFailure from "./pages/Payments/PaymentFailure";
import ManageSubscription from "./pages/Payments/ManageSubscription";
import ReleaseNotes from "./pages/ReleaseNotes/ReleaseNotes";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />

      <AuthProvider>
        <BrowserRouter>
          <AnalyticsTracker />
          <Routes>
            {/* PUBLIC ROUTES */}
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Login />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />

            <Route path="/success" element={<PaymentSuccess />} />
            <Route path="/cancel" element={<PaymentFailure />} />

            {/* PUBLIC LEGAL ROUTES */}
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/terms" element={<TermsConditions />} />

            {/* PROTECTED ROUTES */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />

            <Route
              path="/billing"
              element={
                <ProtectedRoute>
                  <ManageSubscription />
                </ProtectedRoute>
              }
            />

            <Route
              path="/plan-analyzer"
              element={
                <ProtectedRoute>
                  <PlanAnalyzer />
                </ProtectedRoute>
              }
            />

            <Route
              path="/plan-analyzer/:projectId"
              element={
                <ProtectedRoute>
                  <PlanAnalyzerRun />
                </ProtectedRoute>
              }
            />

            <Route
              path="/edit-profile"
              element={
                <ProtectedRoute>
                  <EditProfile />
                </ProtectedRoute>
              }
            />

            <Route
              path="/change-password"
              element={
                <ProtectedRoute>
                  <ChangePassword />
                </ProtectedRoute>
              }
            />

            <Route
              path="/form/bid_form"
              element={
                <ProtectedRoute>
                  <BidForm />
                </ProtectedRoute>
              }
            />

            <Route
              path="/form/change_order"
              element={
                <ProtectedRoute>
                  <Navigate to="/bids" replace />
                </ProtectedRoute>
              }
            />

            <Route
              path="/form/test"
              element={
                <ProtectedRoute>
                  <TestBidForm />
                </ProtectedRoute>
              }
            />

            <Route
              path="/view-bids"
              element={
                <ProtectedRoute>
                  <Navigate to="/bids" replace />
                </ProtectedRoute>
              }
            />

            <Route
              path="/bids/history"
              element={
                <ProtectedRoute>
                  <Navigate to="/bids" replace />
                </ProtectedRoute>
              }
            />

            <Route
              path="/bids"
              element={
                <ProtectedRoute>
                  <MyBids />
                </ProtectedRoute>
              }
            />

            <Route
              path="/bids/:bidId"
              element={
                <ProtectedRoute>
                  <BidWorkspaceLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<BidWorkspaceOverview />} />
              <Route path="form" element={<BidForm />} />
              <Route path="bid-proposal" element={<BidFormProposalEditor />} />
              <Route path="change-orders" element={<BidWorkspaceChangeOrders />} />
              <Route
                path="change-order-proposal"
                element={<BidWorkspaceChangeOrderProposals />}
              />
              <Route path="project-files" element={<ProjectFiles />} />
              <Route path="change-orders/new" element={<ChangeOrderForm />} />
              <Route
                path="change-orders/:changeOrderId/form"
                element={<ChangeOrderForm />}
              />
              <Route
                path="change-orders/:changeOrderId/proposal"
                element={<ChangeOrderProposalEditor />}
              />
            </Route>

            <Route
              path="/bid-editors/history"
              element={
                <ProtectedRoute>
                  <Navigate to="/bids" replace />
                </ProtectedRoute>
              }
            />

            <Route
              path="/bid-editors/:bidEditorId"
              element={
                <ProtectedRoute>
                  <Navigate to="/bids" replace />
                </ProtectedRoute>
              }
            />

            <Route
              path="/release-notes"
              element={
                <ProtectedRoute>
                  <ReleaseNotes />
                </ProtectedRoute>
              }
            />

            {/* 404 */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
