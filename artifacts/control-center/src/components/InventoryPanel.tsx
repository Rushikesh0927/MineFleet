import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useInventory, sendInventoryAction, InventoryItem } from "@/lib/api";
import { Loader2, Package, Shield, ShieldAlert, Crosshair, Droplet } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface InventoryPanelProps {
  botId: string;
}

export default function InventoryPanel({ botId }: InventoryPanelProps) {
  const { data: inventory, isLoading, isError } = useInventory(botId);
  const queryClient = useQueryClient();

  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [isActionPending, setIsActionPending] = useState(false);

  if (isLoading) {
    return <div className="p-8 flex items-center justify-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>;
  }

  if (isError || !inventory) {
    return <div className="p-8 flex items-center justify-center text-red-400 text-sm">Failed to load inventory. Bot may be offline.</div>;
  }

  const handleAction = async (action: any) => {
    try {
      setIsActionPending(true);
      await sendInventoryAction(botId, action);
      toast.success(`Dispatched ${action.type} action`);
      
      // Optimistic refetch
      setTimeout(() => {
         queryClient.invalidateQueries({ queryKey: ["inventory", botId] });
      }, 500);
      
    } catch (err: any) {
      toast.error(err.message || "Action failed");
    } finally {
      setIsActionPending(false);
      setSelectedSlot(null);
    }
  };

  const handleSlotClick = (slotIndex: number) => {
    const isSelected = selectedSlot === slotIndex;
    
    // If we have a slot selected and click a different slot, move item
    if (selectedSlot !== null && !isSelected) {
      handleAction({ type: "move", sourceSlot: selectedSlot, destSlot: slotIndex });
    } else if (isSelected) {
      setSelectedSlot(null); // Deselect
    } else {
       // Only select if there's an item
       const slotItem = inventory.slots[slotIndex];
       if (slotItem && !slotItem.empty) {
          setSelectedSlot(slotIndex);
       }
    }
  };

  const renderSlot = (index: number, label?: string) => {
    const item = inventory.slots[index];
    const isSelected = selectedSlot === index;
    const isMainHand = index === inventory.quickBarSlot;

    return (
      <button
        key={index}
        onClick={() => handleSlotClick(index)}
        className={cn(
          "w-10 h-10 bg-zinc-900 border flex flex-col items-center justify-center relative rounded hover:bg-zinc-800 transition-colors focus:outline-none",
          isSelected ? "border-primary ring-1 ring-primary" : "border-zinc-700",
          isMainHand && !isSelected ? "border-blue-400" : ""
        )}
        title={item && !item.empty ? `${item.displayName} x${item.count}\nSlot: ${index}` : `Empty Slot ${index}`}
      >
        {label && <span className="absolute -top-4 text-[9px] text-muted-foreground">{label}</span>}
        {item && !item.empty && (
           <>
            <span className="text-xs font-bold text-zinc-300 drop-shadow-md z-10 select-none">
              {item.displayName?.substring(0, 3)}
            </span>
            {item.count && item.count > 1 && (
               <span className="absolute bottom-0 right-0.5 text-[10px] font-mono text-white drop-shadow z-10">{item.count}</span>
            )}
           </>
        )}
      </button>
    );
  };

  const selectedItem = selectedSlot !== null ? inventory.slots[selectedSlot] : null;

  return (
    <div className="space-y-6">
      
      {/* Contextual Action Bar */}
      <div className="h-12 flex items-center justify-between bg-sidebar border border-border rounded-lg px-4">
         <div className="text-sm font-medium">
            {selectedItem && !selectedItem.empty ? (
               <span className="text-primary flex items-center gap-2">
                  <Package className="w-4 h-4" />
                  {selectedItem.displayName} x{selectedItem.count}
               </span>
            ) : (
               <span className="text-muted-foreground">Select an item to interact...</span>
            )}
         </div>
         
         <div className="flex items-center gap-2">
            <button 
               disabled={!selectedItem || isActionPending}
               onClick={() => handleAction({ type: "equip", destination: "hand", itemId: selectedItem?.type })}
               className="px-3 py-1.5 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 disabled:opacity-50 text-xs font-semibold rounded transition-colors"
            >
               Equip Hand
            </button>
            <button 
               disabled={!selectedItem || isActionPending}
               onClick={() => handleAction({ type: "equip", destination: "head", itemId: selectedItem?.type })}
               className="px-3 py-1.5 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-50 text-xs font-semibold rounded transition-colors"
            >
               Equip Head
            </button>
            <button 
               disabled={!selectedItem || isActionPending}
               onClick={() => handleAction({ type: "equip", destination: "torso", itemId: selectedItem?.type })}
               className="px-3 py-1.5 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-50 text-xs font-semibold rounded transition-colors"
            >
               Equip Torso
            </button>
            <button 
               disabled={!selectedItem || isActionPending}
               onClick={() => handleAction({ type: "drop", slotId: selectedSlot })}
               className="px-3 py-1.5 bg-red-500/10 text-red-400 hover:bg-red-500/20 disabled:opacity-50 text-xs font-semibold rounded transition-colors"
            >
               Drop
            </button>
            <button 
               disabled={!selectedItem || isActionPending}
               onClick={() => handleAction({ type: "consume" })}
               className="px-3 py-1.5 bg-green-500/10 text-green-400 hover:bg-green-500/20 disabled:opacity-50 text-xs font-semibold rounded transition-colors"
            >
               Consume
            </button>
         </div>
      </div>

      <div className="flex gap-8">
         {/* Equipment Column */}
         <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1 items-center mt-4">
               {renderSlot(5, "Head")}
               {renderSlot(6, "Torso")}
               {renderSlot(7, "Legs")}
               {renderSlot(8, "Feet")}
            </div>
            <div className="flex flex-col gap-1 items-center mt-2">
               {renderSlot(45, "Off-hand")}
            </div>
         </div>

         {/* Main Inventory Grid */}
         <div className="flex-1 flex flex-col gap-4">
            
            {/* Inventory Slots (9-35) */}
            <div className="grid grid-cols-9 gap-1">
               {Array.from({ length: 27 }).map((_, i) => renderSlot(i + 9))}
            </div>

            {/* Spacer */}
            <div className="h-2" />

            {/* Hotbar Slots (36-44) */}
            <div className="grid grid-cols-9 gap-1 relative">
               {Array.from({ length: 9 }).map((_, i) => renderSlot(i + 36))}
            </div>

         </div>
      </div>
    </div>
  );
}
