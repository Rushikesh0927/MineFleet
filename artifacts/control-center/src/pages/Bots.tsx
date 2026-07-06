import { Link } from "wouter";
import { useBots, useTasks, BotStatus } from "@/lib/api";
import { Bot, Server, Heart, Utensils, Wifi, ChevronRight, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

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
  return (
    <Link
      href={`/bots/${bot.id}`}
      className="block bg-card border border-card-border rounded-lg p-4 hover:border-primary/40 transition-colors cursor-pointer group"
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
            <StatusBadge status={bot.status} />
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
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
  const { data: bots, isLoading, isError } = useBots();
  const { data: tasks } = useTasks();

  const taskMap = Object.fromEntries(
    (tasks ?? []).map(t => [t.botId, t.active?.name ?? null])
  );

  const online  = bots?.filter(b => b.status === "ONLINE")  ?? [];
  const offline = bots?.filter(b => b.status !== "ONLINE")  ?? [];

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

  if (!bots || bots.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-2 text-muted-foreground">
        <Bot className="w-10 h-10 opacity-30" />
        <p className="text-sm">No bots configured</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
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
    </div>
  );
}
