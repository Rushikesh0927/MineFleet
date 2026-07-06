import { useBots, usePlugins, useSystem, useLogs, useTasks } from "@/lib/api";
import { useServerContext } from "@/contexts/ServerContext";
import { Bot, Puzzle, Clock, Activity, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  accent?: "green" | "red" | "blue" | "yellow";
}) {
  const color = {
    green:  "text-green-400",
    red:    "text-red-400",
    blue:   "text-primary",
    yellow: "text-yellow-400",
  }[accent ?? "blue"];

  return (
    <div className="bg-card border border-card-border rounded-lg p-4 flex items-start gap-3">
      <div className={cn("mt-0.5 p-2 rounded-md bg-muted", color)}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-foreground leading-none">{value}</p>
        <p className="text-xs text-muted-foreground mt-1">{label}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { cls: string; label: string }> = {
    ONLINE:     { cls: "bg-green-500/15 text-green-400 border-green-500/25",  label: "Online" },
    OFFLINE:    { cls: "bg-muted text-muted-foreground border-border",         label: "Offline" },
    CONNECTING: { cls: "bg-yellow-500/15 text-yellow-400 border-yellow-500/25", label: "Connecting" },
    ERROR:      { cls: "bg-red-500/15 text-red-400 border-red-500/25",         label: "Error" },
  };
  const { cls, label } = cfg[status] ?? cfg.OFFLINE;
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border", cls)}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

export default function Overview() {
  const { activeServerId } = useServerContext();
  const { data: bots, isLoading: botsLoading } = useBots(activeServerId);
  const { data: plugins } = usePlugins();
  const { data: system } = useSystem();
  // We can't filter the REST logs easily by serverId since useLogs returns raw logs,
  // but wait, useConsoleLogs does handle serverId! Let's assume useLogs is fine or we can omit serverId for system logs
  const { data: logs } = useLogs({ limit: 20 });
  const { data: tasks } = useTasks(activeServerId);

  const total   = bots?.length ?? 0;
  const online  = bots?.filter(b => b.status === "ONLINE").length ?? 0;
  const offline = total - online;
  const running = tasks?.filter(t => t.active !== null).length ?? 0;

  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Bots"     value={total}               icon={Bot}      accent="blue" />
        <StatCard label="Online"         value={online}              icon={CheckCircle2} accent="green" />
        <StatCard label="Offline"        value={offline}             icon={AlertTriangle} accent={offline > 0 ? "red" : "blue"} />
        <StatCard label="Running Tasks"  value={running}             icon={Activity}  accent="yellow" />
        <StatCard label="Plugins Loaded" value={plugins?.length ?? 0} icon={Puzzle}   accent="blue" />
        <StatCard
          label="Platform Uptime"
          value={system?.uptimeFormatted ?? "—"}
          icon={Clock}
          accent="blue"
        />
        <StatCard
          label="Memory Used"
          value={system ? `${system.memory.usedMb} MB` : "—"}
          sub={system ? `of ${system.memory.totalMb} MB heap` : undefined}
          icon={Activity}
          accent="blue"
        />
        <StatCard
          label="Node.js"
          value={system?.nodeVersion ?? "—"}
          icon={Bot}
          accent="blue"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bots quick list */}
        <div className="bg-card border border-card-border rounded-lg">
          <div className="px-4 py-3 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground">Bots</h2>
          </div>
          <div className="divide-y divide-border">
            {botsLoading ? (
              <div className="px-4 py-8 text-center text-muted-foreground text-sm">Loading…</div>
            ) : bots?.length === 0 ? (
              <div className="px-4 py-8 text-center text-muted-foreground text-sm">No bots configured</div>
            ) : (
              bots?.slice(0, 6).map(bot => (
                <div key={bot.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{bot.username}</p>
                    {bot.server && (
                      <p className="text-xs text-muted-foreground truncate">{bot.server}</p>
                    )}
                  </div>
                  <StatusBadge status={bot.status} />
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent logs */}
        <div className="bg-card border border-card-border rounded-lg flex flex-col">
          <div className="px-4 py-3 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground">Recent Logs</h2>
          </div>
          <div className="flex-1 overflow-auto font-mono text-xs divide-y divide-border">
            {!logs || logs.length === 0 ? (
              <div className="px-4 py-8 text-center text-muted-foreground font-sans">No logs yet</div>
            ) : (
              [...logs].reverse().slice(0, 12).map(entry => (
                <div key={entry.id} className="px-4 py-1.5 flex gap-3">
                  <span className="text-muted-foreground shrink-0 text-[10px] mt-px">
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 w-10",
                      entry.level === "error" ? "text-red-400" :
                      entry.level === "warn"  ? "text-yellow-400" : "text-muted-foreground"
                    )}
                  >
                    {entry.level.toUpperCase()}
                  </span>
                  <span className="text-foreground break-all">{entry.message}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
