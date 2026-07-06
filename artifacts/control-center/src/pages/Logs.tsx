import { useState } from "react";
import { useLogs } from "@/lib/api";
import { ScrollText, Search, Filter } from "lucide-react";
import { cn } from "@/lib/utils";

type Level = "all" | "info" | "warn" | "error";

const LEVEL_COLORS: Record<string, string> = {
  info:  "text-blue-400",
  warn:  "text-yellow-400",
  error: "text-red-400",
};

export default function Logs() {
  const [level, setLevel]   = useState<Level>("all");
  const [search, setSearch] = useState("");

  const { data: logs, isLoading, isError } = useLogs({
    limit: 300,
    level: level === "all" ? undefined : level,
    search: search || undefined,
  });

  const levels: Level[] = ["all", "info", "warn", "error"];

  return (
    <div className="flex flex-col h-[calc(100vh-9rem)] gap-3">
      {/* Controls */}
      <div className="flex items-center gap-3 shrink-0">
        {/* Level filter */}
        <div className="flex items-center gap-1 bg-card border border-card-border rounded-md p-1">
          {levels.map(l => (
            <button
              key={l}
              onClick={() => setLevel(l)}
              className={cn(
                "px-3 py-1 text-xs rounded font-medium transition-colors capitalize",
                level === l
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {l}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="flex-1 relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="search"
            placeholder="Filter messages…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-card border border-card-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
          />
        </div>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
          <Filter className="w-3 h-3" />
          {logs ? `${logs.length} entries` : "—"}
        </div>
      </div>

      {/* Log pane */}
      <div className="flex-1 bg-card border border-card-border rounded-lg overflow-auto font-mono text-xs">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            Loading logs…
          </div>
        ) : isError ? (
          <div className="flex items-center justify-center h-full text-red-400">
            Failed to load logs.
          </div>
        ) : !logs || logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
            <ScrollText className="w-8 h-8 opacity-30" />
            <p>No log entries</p>
          </div>
        ) : (
          <table className="w-full">
            <tbody>
              {[...logs].reverse().map(entry => (
                <tr key={entry.id} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="px-3 py-1.5 text-[10px] text-muted-foreground whitespace-nowrap w-28">
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </td>
                  <td className={cn("px-2 py-1.5 uppercase font-bold text-[10px] whitespace-nowrap w-12", LEVEL_COLORS[entry.level] ?? "text-muted-foreground")}>
                    {entry.level}
                  </td>
                  <td className="px-3 py-1.5 text-foreground break-all whitespace-pre-wrap">
                    {entry.message}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
