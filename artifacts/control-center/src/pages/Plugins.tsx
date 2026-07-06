import { usePlugins } from "@/lib/api";
import { Puzzle, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Plugins() {
  const { data: plugins, isLoading, isError } = usePlugins();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
        Loading plugins…
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center h-48 text-red-400 text-sm">
        Failed to load plugins.
      </div>
    );
  }

  if (!plugins || plugins.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-2 text-muted-foreground">
        <Puzzle className="w-10 h-10 opacity-30" />
        <p className="text-sm">No plugins loaded</p>
      </div>
    );
  }

  const enabled  = plugins.filter(p => p.enabled);
  const disabled = plugins.filter(p => !p.enabled);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span><span className="text-foreground font-medium">{plugins.length}</span> total</span>
        <span><span className="text-green-400 font-medium">{enabled.length}</span> enabled</span>
        {disabled.length > 0 && (
          <span><span className="text-muted-foreground font-medium">{disabled.length}</span> disabled</span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {plugins.map(plugin => (
          <div key={plugin.name} className="bg-card border border-card-border rounded-lg p-4">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <Puzzle className={cn("w-4 h-4 shrink-0", plugin.enabled ? "text-primary" : "text-muted-foreground")} />
                <span className="text-sm font-semibold text-foreground truncate">{plugin.name}</span>
              </div>
              {plugin.enabled ? (
                <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
              ) : (
                <XCircle className="w-4 h-4 text-muted-foreground shrink-0" />
              )}
            </div>

            {plugin.version && (
              <p className="text-xs text-muted-foreground font-mono mb-1">v{plugin.version}</p>
            )}

            {plugin.description && (
              <p className="text-xs text-muted-foreground leading-relaxed">{plugin.description}</p>
            )}

            <div className="mt-3">
              <span className={cn(
                "inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border",
                plugin.enabled
                  ? "bg-green-500/10 text-green-400 border-green-500/20"
                  : "bg-muted text-muted-foreground border-border"
              )}>
                <span className="w-1.5 h-1.5 rounded-full bg-current" />
                {plugin.enabled ? "Enabled" : "Disabled"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
