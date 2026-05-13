import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/Layout";
import { useAuth, getToken } from "@/hooks/use-auth";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import Login from "@/pages/Login";
import Onboarding from "@/pages/Onboarding";
import Dashboard from "@/pages/Dashboard";
import Schedule from "@/pages/Schedule";
import Jobs from "@/pages/Jobs";
import JobDetail from "@/pages/JobDetail";
import Technicians from "@/pages/Technicians";
import Customers from "@/pages/Customers";
import Inventory from "@/pages/Inventory";
import CustomerPortal from "@/pages/CustomerPortal";
import Bob from "@/pages/Bob";
import Settings from "@/pages/Settings";
import NotFound from "@/pages/not-found";
import SuperAdmin from "@/pages/SuperAdmin";

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();
  const [onboardingChecked, setOnboardingChecked] = useState(false);

  // After auth resolves, check if this tenant has completed onboarding
  useEffect(() => {
    if (!isLoading && user) {
      const token = getToken();
      fetch("/api/tenant/onboarding/status", {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(r => r.json())
        .then((data: any) => {
          if (!data.onboardingCompleted) {
            navigate("/onboarding");
          } else {
            setOnboardingChecked(true);
          }
        })
        .catch(() => setOnboardingChecked(true)); // fail open
    }
    if (!isLoading && !user) navigate("/login");
  }, [user, isLoading]);

  if (isLoading || (user && !onboardingChecked)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!user) return null;

  return <Layout><Component /></Layout>;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/onboarding" component={Onboarding} />
      <Route path="/">{() => <ProtectedRoute component={Dashboard} />}</Route>
      <Route path="/schedule">{() => <ProtectedRoute component={Schedule} />}</Route>
      <Route path="/jobs">{() => <ProtectedRoute component={Jobs} />}</Route>
      <Route path="/jobs/:id">{() => <ProtectedRoute component={JobDetail} />}</Route>
      <Route path="/technicians">{() => <ProtectedRoute component={Technicians} />}</Route>
      <Route path="/customers">{() => <ProtectedRoute component={Customers} />}</Route>
      <Route path="/inventory">{() => <ProtectedRoute component={Inventory} />}</Route>
      <Route path="/bob">{() => <ProtectedRoute component={Bob} />}</Route>
      <Route path="/settings">{() => <ProtectedRoute component={Settings} />}</Route>
      <Route path="/superadmin">{() => <ProtectedRoute component={SuperAdmin} />}</Route>
      <Route path="/portal">{() => <CustomerPortal />}</Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
