import { useParams, Link, useLocation } from "wouter";
import { useFleetBot, useTasks } from "@/lib/api";
import { useServerContext } from "@/contexts/ServerContext";
import {
  ArrowLeft, Bot, Heart, Utensils, Wifi, MapPin,
  AlertTriangle, Play, Square, RotateCw, Trash2, Loader2, ArrowRight
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CommandPanel } from "@/components/CommandPanel";
import InventoryPanel from "@/components/InventoryPanel";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useState } from "react";

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { cls: string; label: string }> = {
    ONLINE:     { cls: "bg-green-500/15 text-green-400 border-green-500/25",   label: "Online" },
    OFFLINE:    { cls: "bg-muted text-muted-foreground border-border",          label: "Offline" },
    CONNECTING: { cls: "bg-yellow-500/15 text-yellow-400 border-yellow-500/25", label: "Connecting" },
    ERROR:      { cls: "bg-red-500/15 text-red-400 border-red-500/25",          label: "Error" },
  };
  const { cls, label } = cfg[status] ?? cfg.OFFLINE;
  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border", cls)}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground font-medium">{value}</span>
    </div>
  );
}

function StatBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.round((value / max) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted-foreground w-10 text-right">{value}/{max}</span>
    </div>
  );
}

export default function BotDetail() {
  const params = useParams<{ id: string }>();
  const id = params.id ?? "";
  const [, setLocation] = useLocation();
  const { activeServerId } = useServerContext();
  const { data: bot, isLoading, isError } = useFleetBot(id);
  const { data: tasks } = useTasks(activeServerId);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  const handleFleetAction = async (action: string) => {
    setLoadingAction(action);
    try {
      const url = action === 'remove' ? `/api/fleet/bots/${id}` : `/api/fleet/bots/${id}/${action}`;
      const res = await fetch(url, { 
        method: action === 'remove' ? 'DELETE' : 'POST' 
      });
      if (!res.ok) throw new Error(`Failed to ${action}`);
      toast.success(`Bot ${action} successful`);
      if (action === 'remove') {
        setLocation('/bots');
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoadingAction(null);
    }
  };

  const botTasks = tasks?.find(t => t.botId === id);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
        Loading…
      </div>
    );
  }

  if (isError || !bot) {
    return (
      <div className="space-y-4">
        <Link
          href="/bots"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Bots
        </Link>
        <div className="flex items-center justify-center h-48 text-red-400 text-sm">
          Bot not found or backend unavailable.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link
          href="/bots"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Bots
        </Link>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-10 h-10 rounded-full flex items-center justify-center",
            bot.status === "ONLINE" ? "bg-green-500/15" : "bg-muted"
          )}>
            <Bot className={cn("w-5 h-5", bot.status === "ONLINE" ? "text-green-400" : "text-muted-foreground")} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">{bot.username}</h2>
            <p className="text-xs text-muted-foreground font-mono">ID: {bot.id}</p>
          </div>
          <StatusBadge status={bot.status} />
        </div>

        {/* Fleet Controls */}
        <div className="flex items-center gap-2">
          {bot.status !== 'ONLINE' && (
            <Button size="sm" variant="outline" onClick={() => handleFleetAction('start')} disabled={loadingAction === 'start'}>
              {loadingAction === 'start' ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Play className="w-4 h-4 mr-1.5" />}
              Start
            </Button>
          )}
          {bot.status === 'ONLINE' && (
            <Button size="sm" variant="outline" onClick={() => handleFleetAction('stop')} disabled={loadingAction === 'stop'}>
              {loadingAction === 'stop' ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Square className="w-4 h-4 mr-1.5" />}
              Stop
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => handleFleetAction('restart')} disabled={loadingAction === 'restart'}>
            {loadingAction === 'restart' ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <RotateCw className="w-4 h-4 mr-1.5" />}
            Restart
          </Button>
          <Button size="sm" variant="destructive" onClick={() => handleFleetAction('remove')} disabled={loadingAction === 'remove'}>
            {loadingAction === 'remove' ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Trash2 className="w-4 h-4 mr-1.5" />}
            Remove
          </Button>
        </div>
      </div>

      {bot.error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          {bot.error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Connection */}
        <div className="bg-card border border-card-border rounded-lg p-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Connection</h3>
          <div>
            <InfoRow label="Server"   value={bot.server     ?? "—"} />
            <InfoRow label="Ping"     value={bot.ping !== undefined ? `${bot.ping}ms` : "—"} />
            <InfoRow label="Uptime"   value={bot.uptime !== undefined ? `${bot.uptime}s` : "—"} />
            <InfoRow label="Game Mode" value={bot.gameMode  ?? "—"} />
            <InfoRow label="Dimension" value={bot.dimension ?? "—"} />
          </div>
        </div>

        {/* Health */}
        <div className="bg-card border border-card-border rounded-lg p-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Vitals</h3>
          <div className="space-y-3">
            {bot.health !== undefined && (
              <div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                  <Heart className="w-3 h-3 text-red-400" /> Health
                </div>
                <StatBar value={bot.health} max={20} color="bg-red-400" />
              </div>
            )}
            {bot.food !== undefined && (
              <div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                  <Utensils className="w-3 h-3 text-yellow-400" /> Hunger
                </div>
                <StatBar value={bot.food} max={20} color="bg-yellow-400" />
              </div>
            )}
            {bot.ping !== undefined && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Wifi className="w-3 h-3" /> Ping: {bot.ping}ms
              </div>
            )}
            {bot.position && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPin className="w-3 h-3" />
                X:{Math.round(bot.position.x)} Y:{Math.round(bot.position.y)} Z:{Math.round(bot.position.z)}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Task Queue Visualizer (Phase 2.4) */}
      <div className="bg-card border border-card-border rounded-lg">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Task Queue</h3>
          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
            {botTasks?.queue?.length ?? 0} queued
          </span>
        </div>
        <div className="p-4">
          {!botTasks?.active && (botTasks?.queue ?? []).length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
              <p className="text-sm">Idle / No tasks queued</p>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground shrink-0">Bot</span>
                <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </div>
              
              {botTasks?.active && (
                <div className="flex items-center gap-2">
                  <div className="px-3 py-1.5 bg-primary/10 text-primary border border-primary/20 rounded-md text-sm font-medium shadow-sm flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                    {botTasks.active.name}
                  </div>
                  {(botTasks.queue.length > 0) && <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />}
                </div>
              )}

              {botTasks?.queue?.map((t, i) => (
                <div key={t.id} className="flex items-center gap-2">
                  <div className="px-3 py-1.5 bg-muted text-muted-foreground border border-border rounded-md text-sm flex items-center gap-2">
                    <span className="text-[10px] bg-background px-1.5 py-0.5 rounded text-muted-foreground">P:{t.priority}</span>
                    {t.name}
                  </div>
                  {i < botTasks.queue.length - 1 && <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Inventory Panel (Phase 2.6) */}
      <div className="bg-card border border-card-border rounded-lg">
         <div className="px-4 py-3 border-b border-border flex items-center justify-between">
           <h3 className="text-sm font-semibold text-foreground">Inventory</h3>
         </div>
         <div className="p-4 overflow-x-auto">
            {bot.status === 'ONLINE' ? (
               <InventoryPanel botId={id} />
            ) : (
               <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
                  <p className="text-sm">Bot must be online to view inventory.</p>
               </div>
            )}
         </div>
      </div>

      {/* Command Panel (Phase 2.2) */}
      <CommandPanel botId={id} isOnline={bot.status === 'ONLINE'} />
    </div>
  );
}
