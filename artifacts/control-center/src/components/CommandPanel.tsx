import { useState } from "react";
import { sendCommand } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";

export function CommandPanel({ botId, isOnline }: { botId: string; isOnline: boolean }) {
  const [loadingCmd, setLoadingCmd] = useState<string | null>(null);

  // States for inputs
  const [goto, setGoto] = useState({ x: "", y: "", z: "" });
  const [look, setLook] = useState({ x: "", y: "", z: "" });
  const [mine, setMine] = useState({ x: "", y: "", z: "" });
  const [place, setPlace] = useState({ x: "", y: "", z: "" });
  const [followTarget, setFollowTarget] = useState("");
  const [attackTarget, setAttackTarget] = useState("");
  const [sneak, setSneak] = useState(false);

  const handleCommand = async (cmdName: string, payload: any) => {
    if (!isOnline) {
      toast.error("Bot must be online to receive commands");
      return;
    }
    setLoadingCmd(cmdName);
    try {
      await sendCommand(botId, { command: cmdName, ...payload });
      toast.success(`Command sent: ${cmdName}`);
    } catch (err: any) {
      toast.error(`Command failed: ${err.message}`);
    } finally {
      setLoadingCmd(null);
    }
  };

  const handleSneakToggle = async (checked: boolean) => {
    setSneak(checked);
    await handleCommand("sneak", { enabled: checked });
  };

  const CoordInputs = ({ value, onChange }: { value: any, onChange: any }) => (
    <div className="flex items-center gap-2 flex-1 min-w-0">
      <Input placeholder="X" value={value.x} onChange={e => onChange({ ...value, x: e.target.value })} className="h-8 text-xs flex-1 min-w-0 px-2" />
      <Input placeholder="Y" value={value.y} onChange={e => onChange({ ...value, y: e.target.value })} className="h-8 text-xs flex-1 min-w-0 px-2" />
      <Input placeholder="Z" value={value.z} onChange={e => onChange({ ...value, z: e.target.value })} className="h-8 text-xs flex-1 min-w-0 px-2" />
    </div>
  );

  return (
    <div className="bg-card border border-card-border rounded-lg p-4 space-y-6">
      <h3 className="text-sm font-semibold text-foreground border-b border-border pb-2">Remote Commands</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Goto */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground uppercase">Goto (x, y, z)</Label>
          <div className="flex items-center gap-2 w-full">
            <CoordInputs value={goto} onChange={setGoto} />
            <Button size="sm" variant="secondary" className="h-8 shrink-0" disabled={loadingCmd === 'goto'} onClick={() => handleCommand('goto', goto)}>
              {loadingCmd === 'goto' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        {/* Look */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground uppercase">Look At (x, y, z)</Label>
          <div className="flex items-center gap-2 w-full">
            <CoordInputs value={look} onChange={setLook} />
            <Button size="sm" variant="secondary" className="h-8 shrink-0" disabled={loadingCmd === 'look'} onClick={() => handleCommand('look', look)}>
              {loadingCmd === 'look' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        {/* Follow */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground uppercase">Follow Target</Label>
          <div className="flex items-center gap-2 w-full">
            <Input placeholder="Player Name" value={followTarget} onChange={e => setFollowTarget(e.target.value)} className="h-8 text-xs flex-1 min-w-0" />
            <Button size="sm" variant="secondary" className="h-8 shrink-0" disabled={loadingCmd === 'follow'} onClick={() => handleCommand('follow', { target: followTarget })}>
              {loadingCmd === 'follow' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        {/* Attack */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground uppercase">Attack Target</Label>
          <div className="flex items-center gap-2 w-full">
            <Input placeholder="Entity / 'hostile'" value={attackTarget} onChange={e => setAttackTarget(e.target.value)} className="h-8 text-xs flex-1 min-w-0" />
            <Button size="sm" variant="secondary" className="h-8 shrink-0" disabled={loadingCmd === 'attack'} onClick={() => handleCommand('attack', { target: attackTarget })}>
              {loadingCmd === 'attack' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        {/* Mine Block */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground uppercase">Mine Block (x, y, z)</Label>
          <div className="flex items-center gap-2 w-full">
            <CoordInputs value={mine} onChange={setMine} />
            <Button size="sm" variant="secondary" className="h-8 shrink-0" disabled={loadingCmd === 'mine'} onClick={() => handleCommand('mine', mine)}>
              {loadingCmd === 'mine' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        {/* Place Block */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground uppercase">Place Block (x, y, z)</Label>
          <div className="flex items-center gap-2 w-full">
            <CoordInputs value={place} onChange={setPlace} />
            <Button size="sm" variant="secondary" className="h-8 shrink-0" disabled={loadingCmd === 'place'} onClick={() => handleCommand('place', place)}>
              {loadingCmd === 'place' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        {/* One-click Actions */}
        <div className="space-y-2 md:col-span-2 lg:col-span-3">
          <Label className="text-xs text-muted-foreground uppercase">Instant Actions</Label>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" variant="destructive" onClick={() => handleCommand('stop', {})}>Stop</Button>
            <Button size="sm" variant="outline" onClick={() => handleCommand('jump', {})}>Jump</Button>
            <Button size="sm" variant="outline" onClick={() => handleCommand('use', {})}>Use Item</Button>
            
            <div className="flex items-center gap-2 ml-4 border-l border-border pl-4">
              <Switch id="sneak-mode" checked={sneak} onCheckedChange={handleSneakToggle} />
              <Label htmlFor="sneak-mode" className="text-sm font-medium">Sneak Mode</Label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
