import { useState } from "react";
import { useFleetProfiles, createFleetProfile, updateFleetProfile, deleteFleetProfile, deployFleetProfile, FleetProfile } from "@/lib/api";
import { Users, Play, Plus, Trash2, Edit, Loader2, Save, X, Server } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";

export default function FleetProfiles() {
  const { data: profiles, isLoading, isError, refetch } = useFleetProfiles();
  const [deployingId, setDeployingId] = useState<string | null>(null);
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<FleetProfile | null>(null);

  // Form State
  const [name, setName] = useState("");
  const [defaultAutoReconnect, setDefaultAutoReconnect] = useState(true);
  const [bots, setBots] = useState<{ username: string; host: string; port: number; version: string }[]>([]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[50vh] text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading profiles...
      </div>
    );
  }

  if (isError || !profiles) {
    return (
      <div className="flex items-center justify-center h-[50vh] text-red-400">
        Failed to load fleet profiles.
      </div>
    );
  }

  const openCreateDialog = () => {
    setEditingProfile(null);
    setName("");
    setDefaultAutoReconnect(true);
    setBots([]);
    setIsDialogOpen(true);
  };

  const openEditDialog = (profile: FleetProfile) => {
    setEditingProfile(profile);
    setName(profile.name);
    setDefaultAutoReconnect(profile.defaultAutoReconnect);
    setBots(profile.bots.map(b => ({ ...b })));
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) return toast.error("Profile name is required");
    if (bots.length === 0) return toast.error("At least one bot is required");
    
    // validate bots
    for (const b of bots) {
      if (!b.username.trim() || !b.host.trim() || !b.port || !b.version.trim()) {
        return toast.error("All bots must have username, host, port, and version");
      }
    }

    try {
      const payload = { name, defaultAutoReconnect, bots };
      if (editingProfile) {
        await updateFleetProfile(editingProfile.id, payload);
        toast.success("Profile updated");
      } else {
        await createFleetProfile(payload);
        toast.success("Profile created");
      }
      setIsDialogOpen(false);
      refetch();
    } catch (err: any) {
      toast.error(err.message || "Failed to save profile");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this profile?")) return;
    try {
      await deleteFleetProfile(id);
      toast.success("Profile deleted");
      refetch();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete profile");
    }
  };

  const handleDeploy = async (id: string) => {
    setDeployingId(id);
    try {
      const res = await deployFleetProfile(id);
      toast.success(`Deployed profile. Scheduled ${res.scheduled} bots, skipped ${res.skipped}.`);
    } catch (err: any) {
      toast.error(err.message || "Failed to deploy profile");
    } finally {
      setDeployingId(null);
    }
  };

  const addBotRow = () => {
    setBots([...bots, { username: "", host: "localhost", port: 25565, version: "1.20.4" }]);
  };

  const removeBotRow = (index: number) => {
    setBots(bots.filter((_, i) => i !== index));
  };

  const updateBot = (index: number, field: string, value: any) => {
    const newBots = [...bots];
    newBots[index] = { ...newBots[index], [field]: value };
    setBots(newBots);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Fleet Profiles</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage and deploy predefined bot fleets</p>
        </div>

        <Button onClick={openCreateDialog} className="shrink-0">
          <Plus className="w-4 h-4 mr-2" />
          Create Profile
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {profiles.length === 0 ? (
          <div className="col-span-full py-12 text-center text-muted-foreground bg-card border border-card-border rounded-lg">
            No fleet profiles created yet.
          </div>
        ) : (
          profiles.map(profile => (
            <div key={profile.id} className="bg-card border border-card-border rounded-lg p-5 flex flex-col relative transition-colors hover:border-primary/20">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground flex items-center gap-2">
                      {profile.name}
                    </h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-muted-foreground">
                        {profile.bots.length} bot{profile.bots.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex-1 mb-6 text-sm text-muted-foreground">
                <div className="flex items-center gap-2 mb-2">
                  <Server className="w-4 h-4" />
                  <span className="truncate">{profile.bots[0]?.host}:{profile.bots[0]?.port} {profile.bots.length > 1 ? '(mixed)' : ''}</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded bg-muted/50 mt-3">
                  <span>AutoReconnect</span>
                  <span className={cn("text-xs font-bold uppercase tracking-wider", profile.defaultAutoReconnect ? "text-green-400" : "text-muted-foreground")}>
                    {profile.defaultAutoReconnect ? "ON" : "OFF"}
                  </span>
                </div>
              </div>

              {/* Action Bar */}
              <div className="flex items-center justify-between pt-4 border-t border-border">
                <Button 
                  onClick={() => handleDeploy(profile.id)}
                  disabled={deployingId !== null}
                  className="w-full mr-3 shadow-none bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20"
                >
                  {deployingId === profile.id ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Play className="w-4 h-4 mr-2" />}
                  Deploy Fleet
                </Button>
                
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" onClick={() => openEditDialog(profile)} className="text-muted-foreground hover:text-foreground">
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(profile.id)} className="text-muted-foreground hover:text-red-400">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl bg-card border-card-border text-foreground">
          <DialogHeader>
            <DialogTitle>{editingProfile ? "Edit Fleet Profile" : "Create Fleet Profile"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Profile Name</Label>
              <Input 
                value={name} 
                onChange={(e) => setName(e.target.value)} 
                placeholder="e.g. Mining Fleet, Lobby Bots"
                className="bg-background border-border"
              />
            </div>
            
            <div className="flex items-center justify-between bg-muted/30 p-3 rounded-lg border border-border">
              <div className="space-y-0.5">
                <Label>Default AutoReconnect</Label>
                <p className="text-xs text-muted-foreground">Automatically reconnect these bots if they disconnect</p>
              </div>
              <Switch checked={defaultAutoReconnect} onCheckedChange={setDefaultAutoReconnect} />
            </div>

            <div className="space-y-3 mt-2">
              <div className="flex items-center justify-between">
                <Label>Bots ({bots.length})</Label>
                <Button variant="outline" size="sm" onClick={addBotRow}>
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  Add Bot
                </Button>
              </div>

              <div className="max-h-[300px] overflow-y-auto space-y-2 pr-1">
                {bots.length === 0 ? (
                  <div className="text-sm text-center py-4 text-muted-foreground border border-dashed border-border rounded-lg">
                    No bots added yet.
                  </div>
                ) : (
                  bots.map((bot, i) => (
                    <div key={i} className="flex gap-2 items-start p-3 bg-muted/20 border border-border rounded-lg relative group">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 flex-1">
                        <div className="space-y-1">
                          <Label className="text-[10px] uppercase text-muted-foreground">Username</Label>
                          <Input className="h-8 bg-background text-sm" value={bot.username} onChange={(e) => updateBot(i, 'username', e.target.value)} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] uppercase text-muted-foreground">Host</Label>
                          <Input className="h-8 bg-background text-sm" value={bot.host} onChange={(e) => updateBot(i, 'host', e.target.value)} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] uppercase text-muted-foreground">Port</Label>
                          <Input type="number" className="h-8 bg-background text-sm" value={bot.port} onChange={(e) => updateBot(i, 'port', parseInt(e.target.value))} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] uppercase text-muted-foreground">Version</Label>
                          <Input className="h-8 bg-background text-sm" value={bot.version} onChange={(e) => updateBot(i, 'version', e.target.value)} />
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-red-400 mt-[22px]" onClick={() => removeBotRow(i)}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>
              <Save className="w-4 h-4 mr-2" />
              Save Profile
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
