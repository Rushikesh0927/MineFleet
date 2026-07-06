import { useState, useRef, useEffect } from "react";
import { useConsoleLogs, ConsoleLogEntry } from "@/lib/api";
import { useServerContext } from "@/contexts/ServerContext";
import { Terminal, Search, Filter, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";

type Category = "All" | "Errors" | "Commands" | "Movement" | "Reconnect" | "Plugins";

const CATEGORY_COLORS: Record<string, string> = {
  All: "text-muted-foreground",
  Errors: "text-red-400",
  Commands: "text-cyan-400",
  Movement: "text-green-400",
  Reconnect: "text-yellow-400",
  Plugins: "text-purple-400",
};

export default function Logs() {
  const [category, setCategory] = useState<Category>("All");
  const [search, setSearch] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  
  const { activeServerId } = useServerContext();
  const { data: logs = [] } = useConsoleLogs(activeServerId);
  
  const scrollRef = useRef<HTMLDivElement>(null);

  const categories: Category[] = ["All", "Errors", "Commands", "Movement", "Reconnect", "Plugins"];

  const filteredLogs = logs.filter(log => {
    if (category !== "All" && log.category !== category) return false;
    if (search && !log.message.toLowerCase().includes(search.toLowerCase()) && 
                  !log.botUsername.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filteredLogs, autoScroll]);

  const handleScroll = () => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
      if (!isAtBottom && autoScroll) setAutoScroll(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-9rem)] gap-3">
      {/* Controls */}
      <div className="flex items-center gap-3 shrink-0">
        {/* Category filter */}
        <div className="flex items-center gap-1 bg-card border border-card-border rounded-md p-1">
          {categories.map(c => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={cn(
                "px-3 py-1 text-xs rounded font-medium transition-colors capitalize",
                category === c
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {c}
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

        <button
          onClick={() => setAutoScroll(!autoScroll)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-colors border",
            autoScroll ? "bg-primary/10 text-primary border-primary/20" : "bg-card text-muted-foreground border-card-border hover:text-foreground"
          )}
        >
          {autoScroll ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
          {autoScroll ? "Auto-scroll On" : "Auto-scroll Off"}
        </button>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0 w-24 justify-end">
          <Filter className="w-3 h-3" />
          {filteredLogs.length} entries
        </div>
      </div>

      {/* Log pane */}
      <div 
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 bg-zinc-950 border border-card-border rounded-lg overflow-auto font-mono text-xs shadow-inner"
      >
        {!logs || logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
            <Terminal className="w-8 h-8 opacity-30" />
            <p>Awaiting live events...</p>
          </div>
        ) : (
          <table className="w-full">
            <tbody>
              {filteredLogs.map(entry => (
                <tr key={entry.id} className="border-b border-white/5 hover:bg-white/5 group">
                  <td className="px-3 py-1 text-[10px] text-zinc-500 whitespace-nowrap w-24">
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </td>
                  <td className="px-2 py-1 font-semibold text-zinc-400 whitespace-nowrap w-32 truncate" title={entry.botUsername}>
                    {entry.botUsername}
                  </td>
                  <td className={cn("px-2 py-1 uppercase font-bold text-[10px] whitespace-nowrap w-24", CATEGORY_COLORS[entry.category] ?? "text-muted-foreground")}>
                    {entry.category}
                  </td>
                  <td className={cn("px-3 py-1 break-all whitespace-pre-wrap", 
                      entry.severity === 'error' ? 'text-red-400' : 
                      entry.severity === 'warn' ? 'text-yellow-400' : 'text-zinc-300'
                  )}>
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
