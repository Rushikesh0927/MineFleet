import { useLocation } from "wouter";
import { Wifi, WifiOff, RefreshCw } from "lucide-react";
import { useHealth, useSystem } from "@/lib/api";
import { cn } from "@/lib/utils";

const PAGE_TITLES: Record<string, string> = {
  "/":        "Overview",
  "/bots":    "Bots",
  "/tasks":   "Tasks",
  "/plugins": "Plugins",
  "/logs":    "Logs",
  "/settings":"Settings",
};

function getTitle(location: string) {
  if (location.startsWith("/bots/")) return "Bot Detail";
  return PAGE_TITLES[location] ?? "MineFleet";
}

export default function TopBar() {
  const [location] = useLocation();
  const { data: health, isLoading, isError } = useHealth();
  const { data: system } = useSystem();

  const online = !isError && !isLoading && health?.status === "ok";

  return (
    <header className="h-12 shrink-0 flex items-center justify-between px-6 border-b border-border bg-background/80 backdrop-blur-sm">
      <h1 className="text-sm font-semibold text-foreground">{getTitle(location)}</h1>

      <div className="flex items-center gap-4">
        {/* Bot count */}
        {system && (
          <span className="text-xs text-muted-foreground">
            <span className="text-green-400 font-medium">{system.bots.online}</span>
            <span className="mx-1">/</span>
            <span>{system.bots.total}</span>
            <span className="ml-1">bots online</span>
          </span>
        )}

        {/* Version */}
        {system?.version && (
          <span className="text-xs text-muted-foreground font-mono">
            v{system.version}
          </span>
        )}

        {/* Connection status */}
        <div className={cn("flex items-center gap-1.5 text-xs font-medium", online ? "text-green-400" : "text-red-400")}>
          {isLoading ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          ) : online ? (
            <Wifi className="w-3.5 h-3.5" />
          ) : (
            <WifiOff className="w-3.5 h-3.5" />
          )}
          <span>{isLoading ? "Connecting…" : online ? "Connected" : "Offline"}</span>
        </div>
      </div>
    </header>
  );
}
