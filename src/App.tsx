import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { BrowserRouter, Routes, Route, Outlet, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { DomainGuard } from "@/components/DomainGuard";
import { Header } from "@/components/Header";
import { KeyboardDismissButton } from "@/components/KeyboardDismissButton";
import { OfflineBanner } from "@/components/OfflineBanner";
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
import Installer from "./pages/Installer";
import UserManualDownload from "./pages/UserManualDownload";
import NotFound from "./pages/NotFound";

// Initialize i18n - must be imported after React setup
import "./i18n";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 min before data is stale
      gcTime: 24 * 60 * 60 * 1000, // Keep cached data for 24 hours
      retry: (failureCount, _error) => {
        if (!navigator.onLine) return false;
        return failureCount < 3;
      },
    },
  },
});

const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: 'avisafe_query_cache',
});

// Layout wrapper that renders Header once for all authenticated routes
const AuthenticatedLayout = () => {
  const { user, loading, isApproved } = useAuth();
  const location = useLocation();
  
  // Don't render Header until we know user is authenticated and approved
  // Exception: offline with cached session — allow rendering
  const isOfflineWithSession = !navigator.onLine && user && !isApproved;
  if (loading || !user || (!isApproved && !isOfflineWithSession)) {
    return <Outlet />;
  }
  
  // Map page needs fixed layout for proper rendering
  const isMapPage = location.pathname === '/kart';
  
  if (isMapPage) {
    return (
      <div className="fixed inset-0 flex flex-col overflow-hidden">
        <Header />
        <OfflineBanner />
        <main className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <Outlet />
        </main>
      </div>
    );
  }
  
  // Other pages use scrollable layout
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <OfflineBanner />
      <main className="flex-1 flex flex-col">
        <Outlet />
      </main>
    </div>
  );
};

// FIX: Refactored to explicit function body to avoid render2 error with provider nesting
const App = () => {
  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={{ persister, maxAge: 24 * 60 * 60 * 1000 }}>
      <TooltipProvider>
        <ErrorBoundary>
          <AuthProvider>
            <BrowserRouter>
              <Toaster />
              <Sonner />
              <KeyboardDismissButton />
              <Routes>
                {/* Public routes - login domain */}
                <Route path="/auth" element={<DomainGuard requireAuth={false}><Auth /></DomainGuard>} />
                <Route path="/reset-password" element={<DomainGuard requireAuth={false}><ResetPassword /></DomainGuard>} />
                <Route path="/installer" element={<Installer />} />
                <Route path="/bruksanvisning" element={<UserManualDownload />} />
                
                {/* Protected routes with shared Header - app domain */}
                <Route element={<AuthenticatedLayout />}>
                  <Route path="/" element={<DomainGuard><Index /></DomainGuard>} />
                  <Route path="/ressurser" element={<DomainGuard><Resources /></DomainGuard>} />
                  <Route path="/kart" element={<DomainGuard><KartPage /></DomainGuard>} />
                  <Route path="/dokumenter" element={<DomainGuard><Documents /></DomainGuard>} />
                  <Route path="/kalender" element={<DomainGuard><Kalender /></DomainGuard>} />
                  <Route path="/hendelser" element={<DomainGuard><Hendelser /></DomainGuard>} />
                  <Route path="/status" element={<DomainGuard><Status /></DomainGuard>} />
                  <Route path="/oppdrag" element={<DomainGuard><Oppdrag /></DomainGuard>} />
                </Route>
                
                {/* Admin has its own header */}
                <Route path="/admin" element={<DomainGuard><Admin /></DomainGuard>} />
                
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </AuthProvider>
        </ErrorBoundary>
      </TooltipProvider>
    </PersistQueryClientProvider>
  );
};

export default App;
