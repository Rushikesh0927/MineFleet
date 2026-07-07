import { useState } from "react";
import { Link } from "wouter";
import { useBots, useTasks, BotStatus } from "@/lib/api";
import { useServerContext } from "@/contexts/ServerContext";
import { Bot, Server, Heart, Utensils, Wifi, ChevronRight, Activity, Play, Square, RotateCw, Home, Users, Loader2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { cls: string; label: string }> = {
    ONLINE:     { cls: "bg-green-500/15 text-green-400 border-green-500/25",   label: "Online" },
    OFFLINE:    { cls: "bg-muted text-muted-foreground border-border",          label: "Offline" },
    CONNECTING: { cls: "bg-yellow-500/15 text-yellow-400 border-yellow-500/25", label: "Connecting" },
    ERROR:      { cls: "bg-red-500/15 text-red-400 border-red-500/25",          label: "Error" },
  };
  const { cls, label } = cfg[status] ?? cfg.OFFLINE;
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border", cls)}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

function BotCard({ bot, activeTask }: { bot: BotStatus; activeTask: string | null }) {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  const handleAction = async (e: React.MouseEvent, action: string) => {
    e.preventDefault(); // Prevent navigating to BotDetail
    setLoadingAction(action);
    try {
      const res = await fetch(`/api/fleet/bots/${bot.id}/${action}`, { method: 'POST' });
      if (!res.ok) throw new Error(`Failed to ${action} ${bot.username}`);
      toast.success(`${bot.username} ${action} successful`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <Link
      href={`/bots/${bot.id}`}
      className="block bg-card border border-card-border rounded-lg p-4 hover:border-primary/40 transition-colors cursor-pointer group relative"
    >
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
              bot.status === "ONLINE" ? "bg-green-500/15" : "bg-muted"
            )}>
              <Bot className={cn("w-4 h-4", bot.status === "ONLINE" ? "text-green-400" : "text-muted-foreground")} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{bot.username}</p>
              {bot.id && (
                <p className="text-xs text-muted-foreground font-mono truncate">#{bot.id}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="group-hover:hidden flex items-center gap-1.5">
              <StatusBadge status={bot.status} />
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
            </div>
            {/* Action Bar (Hover or inline) */}
            <div className="hidden group-hover:flex items-center gap-1" onClick={e => e.preventDefault()}>
          {bot.status !== 'ONLINE' && (
            <Button size="icon" variant="ghost" className="w-7 h-7 text-green-400 hover:text-green-300 hover:bg-green-500/20" onClick={(e) => handleAction(e, 'start')} disabled={loadingAction === 'start'}>
              {loadingAction === 'start' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
            </Button>
          )}
          {bot.status === 'ONLINE' && (
            <Button size="icon" variant="ghost" className="w-7 h-7 text-red-400 hover:text-red-300 hover:bg-red-500/20" onClick={(e) => handleAction(e, 'stop')} disabled={loadingAction === 'stop'}>
              {loadingAction === 'stop' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Square className="w-3 h-3" />}
            </Button>
          )}
          <Button size="icon" variant="ghost" className="w-7 h-7 text-blue-400 hover:text-blue-300 hover:bg-blue-500/20" onClick={(e) => handleAction(e, 'restart')} disabled={loadingAction === 'restart'}>
            {loadingAction === 'restart' ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCw className="w-3 h-3" />}
          </Button>
          </div>
        </div>
      </div>

      {/* Server */}
        {bot.server && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
            <Server className="w-3 h-3 shrink-0" />
            <span className="truncate">{bot.server}</span>
          </div>
        )}

        {/* Stats row */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          {bot.health !== undefined && (
            <span className="flex items-center gap-1">
              <Heart className="w-3 h-3 text-red-400" />
              {bot.health}/20
            </span>
          )}
          {bot.food !== undefined && (
            <span className="flex items-center gap-1">
              <Utensils className="w-3 h-3 text-yellow-400" />
              {bot.food}/20
            </span>
          )}
          {bot.ping !== undefined && (
            <span className="flex items-center gap-1">
              <Wifi className="w-3 h-3" />
              {bot.ping}ms
            </span>
          )}
        </div>

        {/* Active task */}
        {activeTask && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-primary">
            <Activity className="w-3 h-3 shrink-0" />
            <span className="truncate">{activeTask}</span>
          </div>
        )}
        {bot.error && (
          <p className="mt-2 text-xs text-red-400 truncate">{bot.error}</p>
        )}
    </Link>
  );
}

export default function Bots() {
  const { activeServerId } = useServerContext();
  const { data: bots, isLoading, isError } = useBots(activeServerId);
  const { data: tasks } = useTasks(activeServerId);

  const [loadingBulk, setLoadingBulk] = useState<string | null>(null);
  const [followTarget, setFollowTarget] = useState("");

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newBot, setNewBot] = useState({
    username: "MineFleetBot6",
    host: "rushi161928.aternos.me",
    port: 25565,
    version: "1.21.1",
  });
  const [isAdding, setIsAdding] = useState(false);

  const taskMap = Object.fromEntries(
    (tasks ?? []).map(t => [t.botId, t.active?.name ?? null])
  );

  const online  = bots?.filter(b => b.status === "ONLINE")  ?? [];
  const offline = bots?.filter(b => b.status !== "ONLINE")  ?? [];

  const handleBulkAction = async (action: string, payload: any = null) => {
    setLoadingBulk(action);
    try {
      const qs = activeServerId ? `?serverId=${activeServerId}` : "";
      const res = await fetch(`/api/fleet/bulk/${action}${qs}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload ? JSON.stringify(payload) : undefined
      });
      if (!res.ok) {
        let err = `Error ${res.status}`;
        try { const data = await res.json(); err = data.error || err; } catch(e){}
        throw new Error(err);
      }
      toast.success(`Bulk ${action} dispatched`);
    } catch (err: any) {
      toast.error(`Bulk ${action} failed: ${err.message}`);
    } finally {
      setLoadingBulk(null);
    }
  };

  const handleAddBot = async () => {
    setIsAdding(true);
    try {
      const payload = {
        id: newBot.username.toLowerCase(),
        username: newBot.username,
        host: newBot.host,
        port: Number(newBot.port),
        version: newBot.version,
        enabled: true,
        autoReconnect: true
      };
      const res = await fetch('/api/fleet/bots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error("Failed to add bot");
      toast.success("Bot added successfully!");
      setIsDialogOpen(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsAdding(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
        Loading bots…
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center h-48 text-red-400 text-sm">
        Failed to load bots. Is the MineFleet backend running?
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Add Bot Button */}
      <div className="flex justify-end">
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="bg-primary text-primary-foreground">
              <Plus className="w-4 h-4 mr-2" />
              Add Bot
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Add New Bot</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="username" className="text-right">Username</Label>
                <Input id="username" value={newBot.username} onChange={(e) => setNewBot({ ...newBot, username: e.target.value })} className="col-span-3" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="host" className="text-right">Host</Label>
                <Input id="host" value={newBot.host} onChange={(e) => setNewBot({ ...newBot, host: e.target.value })} className="col-span-3" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="port" className="text-right">Port</Label>
                <Input id="port" type="number" value={newBot.port} onChange={(e) => setNewBot({ ...newBot, port: Number(e.target.value) })} className="col-span-3" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="version" className="text-right">Version</Label>
                <Input id="version" value={newBot.version} onChange={(e) => setNewBot({ ...newBot, version: e.target.value })} className="col-span-3" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleAddBot} disabled={isAdding}>
                {isAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Bulk Action Bar */}
      <div className="bg-card border border-card-border rounded-lg p-3 flex flex-col md:flex-row items-center gap-4 shadow-sm">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-8" onClick={() => handleBulkAction('start')} disabled={loadingBulk === 'start'}>
            {loadingBulk === 'start' ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Play className="w-3.5 h-3.5 mr-1.5" />} Start All
          </Button>
          <Button size="sm" variant="outline" className="h-8" onClick={() => handleBulkAction('stop')} disabled={loadingBulk === 'stop'}>
            {loadingBulk === 'stop' ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Square className="w-3.5 h-3.5 mr-1.5" />} Stop All
          </Button>
          <Button size="sm" variant="outline" className="h-8" onClick={() => handleBulkAction('restart')} disabled={loadingBulk === 'restart'}>
            {loadingBulk === 'restart' ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RotateCw className="w-3.5 h-3.5 mr-1.5" />} Restart All
          </Button>
        </div>
        
        <div className="h-4 w-px bg-border hidden md:block" />

        <div className="flex items-center gap-2 w-full md:w-auto ml-auto">
          <div className="flex items-center gap-1 w-full md:w-48">
            <Input placeholder="Follow Target" value={followTarget} onChange={e => setFollowTarget(e.target.value)} className="h-8 text-xs bg-background" />
            <Button size="sm" variant="secondary" className="h-8 shrink-0" onClick={() => handleBulkAction('follow', { target: followTarget })} disabled={loadingBulk === 'follow'}>
              {loadingBulk === 'follow' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Users className="w-3.5 h-3.5" />}
            </Button>
          </div>
          <Button size="sm" variant="secondary" className="h-8 shrink-0" onClick={() => handleBulkAction('gohome')} disabled={loadingBulk === 'gohome'}>
            {loadingBulk === 'gohome' ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Home className="w-3.5 h-3.5 mr-1.5" />} Go Home
          </Button>
        </div>
      </div>

      {!bots || bots.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 gap-2 text-muted-foreground">
          <Bot className="w-10 h-10 opacity-30" />
          <p className="text-sm">No bots configured</p>
        </div>
      ) : (
        <>
          {online.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Online — {online.length}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {online.map(bot => (
                  <BotCard key={bot.id} bot={bot} activeTask={taskMap[bot.id] ?? null} />
                ))}
              </div>
            </section>
          )}

          {offline.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Offline — {offline.length}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {offline.map(bot => (
                  <BotCard key={bot.id} bot={bot} activeTask={taskMap[bot.id] ?? null} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
