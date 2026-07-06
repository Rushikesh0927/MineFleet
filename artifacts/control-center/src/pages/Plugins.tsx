import { useState } from "react";
import { usePlugins, sendPluginAction, Plugin } from "@/lib/api";
import { Package, Power, PowerOff, RotateCw, Settings, Search, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function Plugins() {
  const { data: plugins, isLoading, isError, refetch } = usePlugins();
  const [search, setSearch] = useState("");
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[50vh] text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading plugins...
      </div>
    );
  }

  if (isError || !plugins) {
    return (
      <div className="flex items-center justify-center h-[50vh] text-red-400">
        Failed to load plugins. Make sure the backend is running.
      </div>
    );
  }

  const handleAction = async (name: string, action: string) => {
    setLoadingAction(`${name}-${action}`);
    try {
      const res = await sendPluginAction(name, action);
      if (res.ok) {
        toast.success(res.message || `Plugin ${name} ${action} successful`);
        refetch(); // Refresh plugin state
      } else {
        toast.error(res.error || `Failed to ${action} ${name}`);
      }
    } catch (err: any) {
      toast.error(err.message || `Failed to ${action} ${name}`);
    } finally {
      setLoadingAction(null);
    }
  };

  const filteredPlugins = plugins.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) || 
    p.description.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Plugins</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage global platform behaviors and extensions</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input 
              placeholder="Search plugins..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full sm:w-[250px] pl-9 bg-card border-card-border"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredPlugins.length === 0 ? (
          <div className="col-span-full py-12 text-center text-muted-foreground bg-card border border-card-border rounded-lg">
            No plugins found matching "{search}"
          </div>
        ) : (
          filteredPlugins.map(plugin => (
            <div 
              key={plugin.name}
              className={cn(
                "bg-card border rounded-lg p-5 flex flex-col relative transition-colors",
                plugin.enabled ? "border-primary/20 bg-primary/5" : "border-card-border opacity-75"
              )}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                    plugin.enabled ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                  )}>
                    <Package className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground flex items-center gap-2">
                      {plugin.name}
                    </h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] font-mono bg-background px-1.5 py-0.5 rounded text-muted-foreground">
                        v{plugin.version}
                      </span>
                      <span className={cn(
                        "text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded",
                        plugin.enabled ? "bg-green-500/10 text-green-400" : "bg-muted text-muted-foreground"
                      )}>
                        {plugin.enabled ? "Active" : "Disabled"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <p className="text-sm text-muted-foreground flex-1 mb-6">
                {plugin.description}
              </p>

              {/* Action Bar */}
              <div className="flex items-center justify-between pt-4 border-t border-border">
                <div className="flex items-center gap-2">
                  {plugin.enabled ? (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="text-red-400 hover:text-red-300 hover:bg-red-500/10 border-red-500/20"
                      onClick={() => handleAction(plugin.name, 'disable')}
                      disabled={loadingAction !== null}
                    >
                      {loadingAction === `${plugin.name}-disable` ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <PowerOff className="w-3.5 h-3.5 mr-1.5" />}
                      Disable
                    </Button>
                  ) : (
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="text-green-400 hover:text-green-300 hover:bg-green-500/10 border-green-500/20"
                      onClick={() => handleAction(plugin.name, 'enable')}
                      disabled={loadingAction !== null}
                    >
                      {loadingAction === `${plugin.name}-enable` ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Power className="w-3.5 h-3.5 mr-1.5" />}
                      Enable
                    </Button>
                  )}
                  
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="text-muted-foreground"
                    onClick={() => handleAction(plugin.name, 'reload')}
                    disabled={loadingAction !== null}
                  >
                    {loadingAction === `${plugin.name}-reload` ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <RotateCw className="w-3.5 h-3.5 mr-1.5" />}
                    Reload
                  </Button>
                </div>
                
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="text-muted-foreground"
                  title="Not implemented for this plugin"
                  disabled
                >
                  <Settings className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
