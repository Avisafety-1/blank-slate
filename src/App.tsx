import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { DomainGuard } from "@/components/DomainGuard";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import Admin from "./pages/Admin";
import Resources from "./pages/Resources";
import KartPage from "./pages/Kart";
import Documents from "./pages/Documents";
import Kalender from "./pages/Kalender";
import Hendelser from "./pages/Hendelser";
import Status from "./pages/Status";
import Oppdrag from "./pages/Oppdrag";
import NotFound from "./pages/NotFound";

// Initialize i18n - must be imported after React setup
import "./i18n";

const queryClient = new QueryClient();

// FIX: Refactored to explicit function body to avoid render2 error with provider nesting
const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ErrorBoundary>
          <AuthProvider>
            <BrowserRouter>
              <Toaster />
              <Sonner />
              <Routes>
                {/* Public routes - login domain */}
                <Route path="/auth" element={<DomainGuard requireAuth={false}><Auth /></DomainGuard>} />
                <Route path="/reset-password" element={<DomainGuard requireAuth={false}><ResetPassword /></DomainGuard>} />
                
                {/* Protected routes - app domain */}
                <Route path="/" element={<DomainGuard><Index /></DomainGuard>} />
                <Route path="/admin" element={<DomainGuard><Admin /></DomainGuard>} />
                <Route path="/ressurser" element={<DomainGuard><Resources /></DomainGuard>} />
                <Route path="/kart" element={<DomainGuard><KartPage /></DomainGuard>} />
                <Route path="/dokumenter" element={<DomainGuard><Documents /></DomainGuard>} />
                <Route path="/kalender" element={<DomainGuard><Kalender /></DomainGuard>} />
                <Route path="/hendelser" element={<DomainGuard><Hendelser /></DomainGuard>} />
                <Route path="/status" element={<DomainGuard><Status /></DomainGuard>} />
                <Route path="/oppdrag" element={<DomainGuard><Oppdrag /></DomainGuard>} />
                
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </AuthProvider>
        </ErrorBoundary>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
