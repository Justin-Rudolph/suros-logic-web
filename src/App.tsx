import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import BidForm from "./pages/Form/BidForm";
import TestBidForm from "./pages/Form/TestBidForm";
import AuthPage from "./pages/Auth/AuthPage";
import { AuthProvider } from "./context/AuthContext";
import Login from "./pages/Auth/Login";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      {/*FOR GITHUB PAGES*/}
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/form/bid_form" element={<BidForm />} />
            <Route path="/form/test" element={<TestBidForm />} />
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/auth/login" element={<Login />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
