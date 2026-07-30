import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth";
import { AppLayout } from "@/components/layout";
import NotFound from "@/pages/not-found";

import Login from "@/pages/login";
import Picks from "@/pages/picks";
import Dashboard from "@/pages/dashboard";
import Leaderboard from "@/pages/leaderboard";
import Admin from "@/pages/admin";
import Help from "@/pages/help";
import Recap from "@/pages/recap";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Login} />
        <Route path="/picks" component={Picks} />
        <Route path="/recap" component={Recap} />
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/leaderboard" component={Leaderboard} />
        <Route path="/admin" component={Admin} />
        <Route path="/help" component={Help} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <AuthProvider>
          <TooltipProvider>
            <Router />
            <Toaster />
          </TooltipProvider>
        </AuthProvider>
      </WouterRouter>
    </QueryClientProvider>
  );
}

export default App;
