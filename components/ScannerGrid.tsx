import React, { useEffect, useRef, useState } from 'react';
import { CellType, getCellType } from '../utils/gameLogic';
import { Skull, ShoppingCart, Wrench, Apple } from 'lucide-react';
import L from 'leaflet';

interface ScannerGridProps {
  isHostile: boolean;
  playerPos: { x: number, y: number };
  visited: Record<string, CellType>;
  detectorRange: number; // In Meters
  gps: { lat: number, lon: number } | null;
}

interface Footstep {
    id: number;
    x: number;
    y: number;
    angle: number;
    isRight: boolean;
}

export const ScannerGrid: React.FC<ScannerGridProps> = ({ isHostile, playerPos, visited, detectorRange, gps }) => {
  // Grid lines color
  const gridColor = isHostile ? "stroke-red-600" : "stroke-zinc-700";
  const playerColor = isHostile ? "fill-red-500" : "fill-white";

  // Configuration
  const CELL_SIZE_METERS = 60; // 60 meters per cell
  const CELL_SIZE_PX = 100;    // 100 pixels per cell on screen
  const PIXELS_PER_METER = CELL_SIZE_PX / CELL_SIZE_METERS; // ~1.66 px/m
  const CENTER = 150; // Viewbox center (300/2)

  // Map Refs
  const mapRef = useRef<any>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);

  // --- FOOTSTEPS LOGIC ---
  const [footsteps, setFootsteps] = useState<Footstep[]>([]);
  const lastStepPos = useRef(playerPos); 
  const stepCount = useRef(0);
  const STEP_SPACING = 5.0; // Meters (Increased to 5m for sparse trail)
  const TRAIL_LENGTH_METERS = 25; // Meters

  useEffect(() => {
    // Calculate distance moved since last step
    const dx = playerPos.x - lastStepPos.current.x;
    const dy = playerPos.y - lastStepPos.current.y;
    const dist = Math.sqrt(dx*dx + dy*dy);

    // If moved enough to plant a foot
    if (dist >= STEP_SPACING) {
        const angleRad = Math.atan2(dy, dx);
        const angleDeg = angleRad * (180 / Math.PI);
        
        // Offset Logic for Left/Right foot
        const isRight = stepCount.current % 2 === 0;
        const sideOffset = 2.0; // 2.0m offset from center line (Wide stance for visual clarity)
        const sideMult = isRight ? 1 : -1;
        
        // Normal vector (Right) relative to North-Up coordinate system
        // Angle 0 (East) -> Right is South (0, -1)
        const nx = Math.sin(angleRad);
        const ny = -Math.cos(angleRad);
        
        // Place step at the PREVIOUS position (where the foot pushed off)
        const stepX = lastStepPos.current.x + (nx * sideOffset * sideMult);
        const stepY = lastStepPos.current.y + (ny * sideOffset * sideMult);

        const newStep: Footstep = {
            id: Date.now() + stepCount.current,
            x: stepX,
            y: stepY,
            angle: angleDeg,
            isRight
        };

        setFootsteps(prev => {
            const maxSteps = Math.ceil(TRAIL_LENGTH_METERS / STEP_SPACING);
            const next = [...prev, newStep];
            if (next.length > maxSteps) {
                return next.slice(next.length - maxSteps);
            }
            return next;
        });

        lastStepPos.current = playerPos;
        stepCount.current++;
    }
  }, [playerPos]);


  // Map Initialization
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    
    // Create Map
    const map = L.map(mapContainerRef.current, {
        center: [0, 0],
        zoom: 2,
        attributionControl: false,
        zoomControl: false,
        zoomAnimation: false,
        fadeAnimation: true,
        inertia: false,
        keyboard: false,
        dragging: false,
        touchZoom: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        boxZoom: false
    });
    
    L.tileLayer('https://tiles.stadiamaps.com/styles/stamen_toner_dark/{z}/{x}/{y}{r}.png', {
        maxZoom: 20,
        attribution: '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a>',
    }).addTo(map);

    mapRef.current = map;

    setTimeout(() => {
        map.invalidateSize();
        if (gps) {
             map.setView([gps.lat, gps.lon], 18);
        }
    }, 500);

    return () => {
        map.remove();
        mapRef.current = null;
    };
  }, []); 

  // Sync Map with GPS
  useEffect(() => {
      if (mapRef.current && gps) {
          mapRef.current.invalidateSize(); 
          mapRef.current.setView([gps.lat, gps.lon], 18, { animate: true }); 
      }
  }, [gps]);


  // Grid background scrolling logic
  const offsetX = playerPos.x % CELL_SIZE_METERS;
  const offsetY = playerPos.y % CELL_SIZE_METERS;
  const shiftX = offsetX * PIXELS_PER_METER;
  const shiftY = offsetY * PIXELS_PER_METER;

  // Helper to get screen position
  const getScreenPos = (cx: number, cy: number) => {
    // World coordinates of cell center
    const cellWorldX = cx * CELL_SIZE_METERS + (CELL_SIZE_METERS / 2); 
    const cellWorldY = cy * CELL_SIZE_METERS + (CELL_SIZE_METERS / 2);
    
    // Relative position to player in pixels
    const relX = (cellWorldX - playerPos.x) * PIXELS_PER_METER;
    const relY = (cellWorldY - playerPos.y) * PIXELS_PER_METER;
    
    return {
        x: CENTER + relX,
        y: CENTER - relY
    };
  };

  // Helper for arbitrary meter points (Footsteps)
  const getScreenPoint = (mx: number, my: number) => {
    const relX = (mx - playerPos.x) * PIXELS_PER_METER;
    const relY = (my - playerPos.y) * PIXELS_PER_METER;
    return { 
        x: CENTER + relX, 
        y: CENTER - relY 
    };
  };

  // Calculate Highlight Rectangle Position explicitly
  const currentCellX = Math.floor(playerPos.x / CELL_SIZE_METERS);
  const currentCellY = Math.floor(playerPos.y / CELL_SIZE_METERS);
  const highlightPos = getScreenPos(currentCellX, currentCellY);

  // Helper to render icon content
  const getIconContent = (type: CellType, color: string, pulse: boolean = false) => {
      const cls = pulse ? "animate-pulse" : "";
      if (type === 'EMPTY') {
          return (
             <g className={cls}>
                 <path 
                    d="M-8 -8 L8 8 M8 -8 L-8 8" 
                    stroke={color} 
                    strokeWidth="3" 
                    strokeLinecap="round" 
                />
             </g>
          );
      } else if (type === 'FOOD') {
          return (
            <foreignObject x="-12" y="-12" width="24" height="24" className={cls}>
                 <div className="flex items-center justify-center w-full h-full">
                    <Apple size={18} color={color} />
                 </div>
            </foreignObject>
          );
      } else if (type === 'COIN') {
          return <circle r="15" stroke={color} strokeWidth="3" fill="none" className={cls} />;
      } else if (type === 'SUPERMARKET') {
          return (
            <foreignObject x="-12" y="-12" width="24" height="24" className={cls}>
                 <div className="flex items-center justify-center w-full h-full">
                    <ShoppingCart size={20} color={color} />
                 </div>
            </foreignObject>
          );
      } else if (type === 'TOOL_SHOP') {
          return (
            <foreignObject x="-12" y="-12" width="24" height="24" className={cls}>
                 <div className="flex items-center justify-center w-full h-full">
                    <Wrench size={20} color={color} />
                 </div>
            </foreignObject>
          );
      } else if (type === 'HOSTILE') {
          return (
             <foreignObject x="-12" y="-12" width="24" height="24" className={cls}>
                 <div className="flex items-center justify-center w-full h-full">
                     <Skull size={20} color={color} />
                 </div>
             </foreignObject>
          );
      }
      return null;
  };

  // Renders cells that have been visited or special persistent markers (Shop/Hostile)
  const renderVisitedCells = () => {
      const visibleRange = 2; // Show cells +/- 2 from center
      const elements = [];

      for (let cx = currentCellX - visibleRange; cx <= currentCellX + visibleRange; cx++) {
          for (let cy = currentCellY - visibleRange; cy <= currentCellY + visibleRange; cy++) {
              const key = `${cx},${cy}`;
              const visitedType = visited[key];
              
              if (visitedType) {
                   const { x, y } = getScreenPos(cx, cy);
                   const content = getIconContent(visitedType, visitedType === 'HOSTILE' ? '#dc2626' : '#52525b');
                   if (content) {
                       elements.push(
                           <g key={`vis-${key}`} transform={`translate(${x}, ${y})`} opacity="0.6">
                               {content}
                           </g>
                       );
                   }
              }
          }
      }
      return elements;
  };

  // Renders unvisited items that are hidden in the dark but revealed by the detector mask
  const renderHiddenItems = () => {
      const elements = [];
      const visibleRange = 1; // Range to perform lookups (optimization)

      for (let cx = currentCellX - visibleRange; cx <= currentCellX + visibleRange; cx++) {
          for (let cy = currentCellY - visibleRange; cy <= currentCellY + visibleRange; cy++) {
              const key = `${cx},${cy}`;
              
              // Skip if already visited/cleared
              if (visited[key]) continue;

              const type = getCellType(cx, cy);
              
              // Render Coins, Food, Hostiles, and Shops in detector
              if (type === 'COIN' || type === 'FOOD' || type === 'HOSTILE' || type === 'SUPERMARKET' || type === 'TOOL_SHOP') {
                   const { x, y } = getScreenPos(cx, cy);
                   
                   // Color coding for detector view
                   let color = '#4ade80'; // Green default
                   if (type === 'HOSTILE') color = '#ef4444'; // Red
                   if (type === 'SUPERMARKET' || type === 'TOOL_SHOP') color = '#60a5fa'; // Blue
                   // Food uses Green default

                   const content = getIconContent(type, color, false);
                   
                   elements.push(
                        <g key={`hid-${key}`} transform={`translate(${x}, ${y})`}>
                            {content}
                        </g>
                   );
              }
          }
      }
      return elements;
  };

  const detectorRadiusPx = detectorRange * PIXELS_PER_METER;

  return (
    <div className="w-full h-full relative flex items-center justify-center overflow-hidden bg-black">
      
      {/* 1. MAP LAYER (Background) */}
      <div 
        ref={mapContainerRef} 
        className="absolute inset-0 z-0 opacity-50"
        style={{ pointerEvents: 'none', background: '#111' }} 
      />

      {/* 2. TORCH VIGNETTE (Overlay on Map) */}
      <div 
        className="absolute inset-0 z-0 pointer-events-none"
        style={{ background: 'radial-gradient(circle at center, transparent 15%, #000 85%)' }}
      ></div>

      {/* 3. GRID & UI (Foreground) */}
      <div className="w-full aspect-square relative flex items-center justify-center p-4 z-10">
        <svg width="100%" height="100%" viewBox="0 0 300 300" className="overflow-visible">
            <defs>
                <pattern id="smallGrid" width="10" height="10" patternUnits="userSpaceOnUse">
                    <path d="M 10 0 L 0 0 0 10" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-zinc-900"/>
                </pattern>
                
                {/* DETECTOR MASK: White center (visible), fading to black (hidden) */}
                <mask id="detectorMask">
                    <radialGradient id="detectorGradient">
                        <stop offset="50%" stopColor="white" stopOpacity="1"/>
                        <stop offset="100%" stopColor="white" stopOpacity="0"/>
                    </radialGradient>
                    <circle cx="150" cy="150" r={detectorRadiusPx} fill="url(#detectorGradient)" />
                </mask>
            </defs>

            {/* Moving Grid Layer */}
            <g transform={`translate(${-shiftX}, ${shiftY})`}>
                {/* Grid Lines */}
                {[...Array(5)].map((_, i) => (
                    <React.Fragment key={i}>
                        <line 
                            x1={CENTER + (i-2)*CELL_SIZE_PX} y1="-150" 
                            x2={CENTER + (i-2)*CELL_SIZE_PX} y2="450" 
                            className={`${gridColor} transition-colors duration-300`} 
                            strokeWidth="1" strokeDasharray="4 4" 
                        />
                        <line 
                            x1="-150" y1={CENTER + (i-2)*CELL_SIZE_PX} 
                            x2="450" y2={CENTER + (i-2)*CELL_SIZE_PX} 
                            className={`${gridColor} transition-colors duration-300`} 
                            strokeWidth="1" strokeDasharray="4 4" 
                        />
                    </React.Fragment>
                ))}
            </g>

            {/* Current Cell Highlight (Static Overlay) */}
            <rect 
                x={highlightPos.x - CELL_SIZE_PX / 2} 
                y={highlightPos.y - CELL_SIZE_PX / 2} 
                width={CELL_SIZE_PX} 
                height={CELL_SIZE_PX} 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                className={`${isHostile ? 'text-red-500 animate-pulse' : 'text-zinc-500'}`} 
            />

            {/* Footstep Trail */}
            {footsteps.map((step, i) => {
                const pos = getScreenPoint(step.x, step.y);
                const opacity = (Math.max(0, (i + 1) / footsteps.length)) * 0.5;
                const rot = 90 - step.angle;

                return (
                    <g key={step.id} transform={`translate(${pos.x}, ${pos.y}) rotate(${rot})`} opacity={opacity}>
                         <rect 
                            x="-1.5" y="-3.5" 
                            width="3" height="7" 
                            rx="1.5" 
                            fill="white" 
                            className="drop-shadow-lg"
                        />
                    </g>
                );
            })}

            {/* Visited Cells (Always Visible) */}
            {renderVisitedCells()}

            {/* Hidden Cells (Revealed by Torch Mask) */}
            <g mask="url(#detectorMask)">
                {renderHiddenItems()}
            </g>

            <circle cx="150" cy="150" r={detectorRadiusPx} fill="none" stroke="#4ade80" strokeWidth="1" strokeDasharray="2 4" opacity="0.2" />

            {/* Player Position Marker - Always Center */}
            <circle cx="150" cy="150" r="4" className={`${playerColor} transition-colors duration-300 drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]`} />
        </svg>
      </div>
    </div>
  );
};