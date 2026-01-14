import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/Layout";
import { useAuth } from "@/hooks/use-auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

import Dashboard from "@/pages/Dashboard";
import Schedule from "@/pages/Schedule";
import Jobs from "@/pages/Jobs";
import JobDetail from "@/pages/JobDetail";
import Technicians from "@/pages/Technicians";
import Customers from "@/pages/Customers";
import Inventory from "@/pages/Inventory";
import LiveMap from "@/pages/LiveMap";
import NotFound from "@/pages/not-found";

import TechJobs from "@/pages/tech/TechJobs";
import TechJobDetail from "@/pages/tech/TechJobDetail";
import TechProfile from "@/pages/tech/TechProfile";
import TechMap from "@/pages/tech/TechMap";
import TechPhotos from "@/pages/tech/TechPhotos";

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !user) {
      window.location.href = "/api/login";
    }
  }, [user, isLoading]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <Layout>
      <Component />
    </Layout>
  );
}

function ProtectedMobileRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && !user) {
      window.location.href = "/api/login";
    }
  }, [user, isLoading]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return null;

  return <Component />;
}

function Router() {
  const isMobile = useIsMobile();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (isMobile && location === "/") {
      setLocation("/tech");
    }
  }, [isMobile, location, setLocation]);

  return (
    <Switch>
      <Route path="/tech">
        {() => <ProtectedMobileRoute component={TechJobs} />}
      </Route>
      <Route path="/tech/job/:id">
        {() => <ProtectedMobileRoute component={TechJobDetail} />}
      </Route>
      <Route path="/tech/map">
        {() => <ProtectedMobileRoute component={TechMap} />}
      </Route>
      <Route path="/tech/photos">
        {() => <ProtectedMobileRoute component={TechPhotos} />}
      </Route>
      <Route path="/tech/profile">
        {() => <ProtectedMobileRoute component={TechProfile} />}
      </Route>

      <Route path="/">
        {() => <ProtectedRoute component={Dashboard} />}
      </Route>
      <Route path="/schedule">
        {() => <ProtectedRoute component={Schedule} />}
      </Route>
      <Route path="/jobs">
        {() => <ProtectedRoute component={Jobs} />}
      </Route>
      <Route path="/jobs/:id">
        {() => <ProtectedRoute component={JobDetail} />}
      </Route>
      <Route path="/technicians">
        {() => <ProtectedRoute component={Technicians} />}
      </Route>
      <Route path="/customers">
        {() => <ProtectedRoute component={Customers} />}
      </Route>
      <Route path="/inventory">
        {() => <ProtectedRoute component={Inventory} />}
      </Route>
      <Route path="/live-map">
        {() => <ProtectedRoute component={LiveMap} />}
      </Route>
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
