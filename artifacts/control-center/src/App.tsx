import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import Layout from "@/components/Layout";
import Overview from "@/pages/Overview";
import Bots from "@/pages/Bots";
import BotDetail from "@/pages/BotDetail";
import Tasks from "@/pages/Tasks";
import Plugins from "@/pages/Plugins";
import Logs from "@/pages/Logs";
import Settings from "@/pages/Settings";
import WorldMap from "@/pages/WorldMap";
import NotFound from "@/pages/not-found";

import FleetProfiles from "@/pages/FleetProfiles";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 1000,
    },
  },
});

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Overview} />
        <Route path="/bots" component={Bots} />
        <Route path="/bots/:id" component={BotDetail} />
        <Route path="/profiles" component={FleetProfiles} />
        <Route path="/tasks" component={Tasks} />
        <Route path="/plugins" component={Plugins} />
        <Route path="/logs" component={Logs} />
        <Route path="/map" component={WorldMap} />
        <Route path="/settings" component={Settings} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

import { ServerProvider } from "@/contexts/ServerContext";

function App() {
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ServerProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
        </ServerProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
