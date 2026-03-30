import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

import BidForm from "./pages/Form/BidForm";
import ChangeOrderForm from "./pages/Form/ChangeOrderForm";
import TestBidForm from "./pages/Form/TestBidForm";

import Login from "./pages/Auth/Login";

import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./routes/ProtectedRoute";

import Dashboard from "./pages/Dashboard/Dashboard";
import EditProfile from "./pages/Profile/EditProfile";
import ChangePassword from "./pages/Profile/ChangePassword";
import ForgotPassword from "./pages/Auth/ForgotPassword";

import PrivacyPolicy from "./pages/Legal/PrivacyPolicy";
import TermsConditions from "./pages/Legal/TermsConditions";

import ViewBids from "./pages/Bids/ViewBids";
import BidHistory from "./pages/Bids/BidHistory";
import PriceEstimator from "./components/PriceEstimator";

import PaymentSuccess from "./pages/Payments/PaymentSuccess";
import PaymentFailure from "./pages/Payments/PaymentFailure";
import ManageSubscription from "./pages/Payments/ManageSubscription";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />

      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* PUBLIC ROUTES */}
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Login />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/estimate" element={<PriceEstimator />} />

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
                  <ChangeOrderForm />
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
                  <ViewBids />
                </ProtectedRoute>
              }
            />

            <Route
              path="/bids/history"
              element={
                <ProtectedRoute>
                  <BidHistory />
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
