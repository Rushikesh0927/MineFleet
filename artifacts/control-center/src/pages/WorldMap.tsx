import { useState, useMemo } from "react";
import { useMapPositions } from "@/lib/api";
import { Map as MapIcon, Layers, Maximize, ZoomIn, ZoomOut, Compass } from "lucide-react";
import { cn } from "@/lib/utils";

export default function WorldMap() {
  const { data: positions = [], isLoading, isError } = useMapPositions();
  
  const [dimension, setDimension] = useState<string>("minecraft:overworld");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, z: 0 });

  // Dimensions present in current data
  const dimensions = useMemo(() => {
    const dims = new Set<string>();
    positions.forEach(p => dims.add(p.dimension));
    if (dims.size === 0) dims.add("minecraft:overworld");
    return Array.from(dims);
  }, [positions]);

  // Filter positions by selected dimension
  const currentPositions = useMemo(() => {
    return positions.filter(p => p.dimension === dimension);
  }, [positions, dimension]);

  // Handle map panning
  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setZoom(z => Math.max(0.1, Math.min(10, z - e.deltaY * 0.005)));
    } else {
      setPan(p => ({
        x: p.x + e.deltaX / zoom,
        z: p.z + e.deltaY / zoom,
      }));
    }
  };

  // Auto-center if we have points and haven't panned
  const autoCenter = () => {
    if (currentPositions.length === 0) return;
    let minX = Infinity, maxX = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    currentPositions.forEach(p => {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
      if (p.destination) {
        minX = Math.min(minX, p.destination.x);
        maxX = Math.max(maxX, p.destination.x);
        minZ = Math.min(minZ, p.destination.z);
        maxZ = Math.max(maxZ, p.destination.z);
      }
    });
    setPan({ x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 });
    
    // Auto-zoom to fit with padding
    const width = maxX - minX;
    const height = maxZ - minZ;
    const maxDim = Math.max(width, height, 50); // min 50 blocks
    setZoom(Math.min(3, 400 / maxDim));
  };

  // Map coordinate to SVG coordinate
  const mapX = (x: number) => (x - pan.x) * zoom;
  const mapZ = (z: number) => (z - pan.z) * zoom;

  return (
    <div className="flex flex-col h-[calc(100vh-9rem)] gap-4">
      {/* Header & Controls */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <MapIcon className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">World Map</h1>
            <p className="text-sm text-muted-foreground">Live 2D Top-Down View</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Dimension Selector */}
          <div className="flex items-center gap-1 bg-card border border-card-border rounded-md p-1">
            <div className="px-2 flex items-center text-muted-foreground">
              <Layers className="w-3.5 h-3.5" />
            </div>
            {dimensions.map(dim => (
              <button
                key={dim}
                onClick={() => setDimension(dim)}
                className={cn(
                  "px-3 py-1.5 text-xs rounded font-medium transition-colors capitalize",
                  dimension === dim
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {dim.replace("minecraft:", "")}
              </button>
            ))}
          </div>
          
          <div className="flex items-center bg-card border border-card-border rounded-md p-1">
             <button onClick={() => setZoom(z => Math.max(0.1, z - 0.2))} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded"><ZoomOut className="w-4 h-4" /></button>
             <button onClick={() => setZoom(z => Math.min(10, z + 0.2))} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded"><ZoomIn className="w-4 h-4" /></button>
             <button onClick={autoCenter} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded" title="Auto-center"><Maximize className="w-4 h-4" /></button>
          </div>
        </div>
      </div>

      {/* Map Canvas */}
      <div 
        className="flex-1 bg-zinc-950 border border-card-border rounded-lg overflow-hidden relative"
        onWheel={handleWheel}
      >
        <div className="absolute top-4 left-4 flex flex-col items-center opacity-30 pointer-events-none">
           <Compass className="w-8 h-8 text-white mb-1" />
           <span className="text-[10px] font-bold tracking-widest text-white">N (-Z)</span>
        </div>

        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            Loading map...
          </div>
        ) : isError ? (
          <div className="absolute inset-0 flex items-center justify-center text-red-400">
            Failed to load positions.
          </div>
        ) : currentPositions.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
             No entities detected in {dimension.replace('minecraft:', '')}
          </div>
        ) : (
          <svg className="w-full h-full cursor-grab active:cursor-grabbing" style={{ touchAction: 'none' }}>
            <g transform={`translate(50%, 50%)`}>
              
              {/* Origin Crosshair */}
              <path d={`M ${mapX(0)} ${mapZ(-10)} L ${mapX(0)} ${mapZ(10)} M ${mapX(-10)} ${mapZ(0)} L ${mapX(10)} ${mapZ(0)}`} stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
              <text x={mapX(2)} y={mapZ(-2)} fill="rgba(255,255,255,0.2)" fontSize="10">(0,0)</text>

              {/* Destination Lines */}
              {currentPositions.map(p => {
                if (!p.destination) return null;
                return (
                  <g key={`line-${p.type}-${p.username}`}>
                     <line 
                        x1={mapX(p.x)} 
                        y1={mapZ(p.z)} 
                        x2={mapX(p.destination.x)} 
                        y2={mapZ(p.destination.z)} 
                        stroke={p.type === 'bot' ? 'rgba(56, 189, 248, 0.4)' : 'rgba(167, 139, 250, 0.4)'} 
                        strokeWidth="2" 
                        strokeDasharray="4 4"
                     />
                     <path 
                        d={`M ${mapX(p.destination.x) - 4} ${mapZ(p.destination.z) - 4} L ${mapX(p.destination.x) + 4} ${mapZ(p.destination.z) + 4} M ${mapX(p.destination.x) - 4} ${mapZ(p.destination.z) + 4} L ${mapX(p.destination.x) + 4} ${mapZ(p.destination.z) - 4}`}
                        stroke="rgba(239, 68, 68, 0.8)"
                        strokeWidth="2"
                     />
                  </g>
                );
              })}

              {/* Entity Markers */}
              {currentPositions.map(p => (
                <g key={`marker-${p.type}-${p.username}`} transform={`translate(${mapX(p.x)}, ${mapZ(p.z)})`}>
                  {p.type === 'bot' ? (
                    <circle cx="0" cy="0" r="6" fill="#38bdf8" />
                  ) : (
                    <path d="M 0 -8 L 6 6 L -6 6 Z" fill="#fbbf24" />
                  )}
                  <text 
                     x="10" 
                     y="4" 
                     fill="white" 
                     fontSize="12" 
                     className="font-mono drop-shadow-md"
                     style={{ textShadow: '0 1px 2px black' }}
                  >
                     {p.username}
                  </text>
                </g>
              ))}

            </g>
          </svg>
        )}
      </div>
    </div>
  );
}
