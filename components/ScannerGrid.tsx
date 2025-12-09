import React, { useEffect, useRef } from 'react';
import { CellType, getCellType } from '../utils/gameLogic';
import { Skull, ShoppingBag } from 'lucide-react';

// Declare Leaflet global
declare const L: any;

interface ScannerGridProps {
  isHostile: boolean;
  playerPos: { x: number, y: number };
  visited: Record<string, CellType>;
  isDetectorActive: boolean;
  gps: { lat: number, lon: number } | null;
}

export const ScannerGrid: React.FC<ScannerGridProps> = ({ isHostile, playerPos, visited, isDetectorActive, gps }) => {
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

  // Map Initialization
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    
    // Check if Leaflet is loaded
    if (typeof L === 'undefined') return;

    // Create Map
    const map = L.map(mapContainerRef.current, {
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
        boxZoom: false,
        tap: false
    });
    
    // CartoDB Dark Matter (API-Key-Free alternative to Stadia for easy setup)
    // To use Stadia, swap the URL to: https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 20,
        subdomains: 'abcd'
    }).addTo(map);

    mapRef.current = map;

    return () => {
        map.remove();
        mapRef.current = null;
    };
  }, []);

  // Sync Map with GPS
  useEffect(() => {
      if (mapRef.current && gps) {
          mapRef.current.setView([gps.lat, gps.lon], 18); // Zoom 18 matches ~60m scale reasonably well
      }
  }, [gps]);


  // Grid background scrolling logic
  // REMOVED Math.abs() to ensure correct scrolling direction for negative coordinates
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

  // Calculate Highlight Rectangle Position explicitly
  const currentCellX = Math.floor(playerPos.x / CELL_SIZE_METERS);
  const currentCellY = Math.floor(playerPos.y / CELL_SIZE_METERS);
  const highlightPos = getScreenPos(currentCellX, currentCellY);

  // Helper to render icon content
  const getIconContent = (type: CellType, color: string, pulse: boolean = false) => {
      const cls = pulse ? "animate-pulse" : "";
      if (type === 'EMPTY') {
          // Geometric Cross (X) instead of Text
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
            <g className={cls}>
                <path d="M-10 0 H10 M0 -10 V10" stroke={color} strokeWidth="4" />
            </g>
          );
      } else if (type === 'COIN') {
          return <circle r="15" stroke={color} strokeWidth="3" fill="none" className={cls} />;
      } else if (type === 'SHOP') {
          return (
            <foreignObject x="-12" y="-12" width="24" height="24" className={cls}>
                 <div className="flex items-center justify-center w-full h-full">
                    <ShoppingBag size={20} color={color} />
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

  const renderCells = () => {
      const visibleRange = 2; // Show cells +/- 2 from center (5x5 grid)
      const elements = [];

      for (let cx = currentCellX - visibleRange; cx <= currentCellX + visibleRange; cx++) {
          for (let cy = currentCellY - visibleRange; cy <= currentCellY + visibleRange; cy++) {
              const key = `${cx},${cy}`;
              const visitedType = visited[key];
              const { x, y } = getScreenPos(cx, cy);

              // 1. Priority: Visited/Excavated Markers
              if (visitedType) {
                   const content = getIconContent(visitedType, visitedType === 'HOSTILE' ? '#dc2626' : '#52525b');
                   if (content) {
                       elements.push(
                           <g key={`vis-${key}`} transform={`translate(${x}, ${y})`} opacity="0.6">
                               {content}
                           </g>
                       );
                   }
              } 
              // 2. Secondary: Metal Detector Hints
              else if (isDetectorActive) {
                   // Check if within 1 cell radius (3x3 area)
                   if (Math.abs(cx - currentCellX) <= 1 && Math.abs(cy - currentCellY) <= 1) {
                        const type = getCellType(cx, cy);
                        const content = getIconContent(type, '#4ade80', true); // Green, Pulse
                        if (content) {
                             elements.push(
                                <g key={`det-${key}`} transform={`translate(${x}, ${y})`}>
                                    {content}
                                </g>
                             );
                        }
                   }
              }
          }
      }
      return elements;
  };

  return (
    <div className="w-full h-full relative flex items-center justify-center overflow-hidden bg-black">
      
      {/* 1. MAP LAYER (Background) */}
      <div 
        ref={mapContainerRef} 
        className="absolute inset-0 z-0 opacity-40 grayscale mix-blend-screen"
        style={{ pointerEvents: 'none' }} 
      />

      {/* 2. TORCH VIGNETTE (Overlay on Map) */}
      {/* Creates the flashlight effect where only the center is visible */}
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
            </defs>

            {/* Moving Grid Layer */}
            <g transform={`translate(${-shiftX}, ${shiftY})`}>
                {/* Grid Lines */}
                {[...Array(5)].map((_, i) => (
                    <React.Fragment key={i}>
                        {/* Vertical */}
                        <line 
                            x1={CENTER + (i-2)*CELL_SIZE_PX} y1="-150" 
                            x2={CENTER + (i-2)*CELL_SIZE_PX} y2="450" 
                            className={`${gridColor} transition-colors duration-300`} 
                            strokeWidth="1" strokeDasharray="4 4" 
                        />
                        {/* Horizontal */}
                        <line 
                            x1="-150" y1={CENTER + (i-2)*CELL_SIZE_PX} 
                            x2="450" y2={CENTER + (i-2)*CELL_SIZE_PX} 
                            className={`${gridColor} transition-colors duration-300`} 
                            strokeWidth="1" strokeDasharray="4 4" 
                        />
                    </React.Fragment>
                ))}
            </g>

            {/* Static Overlay Layer: Current Cell Highlight */}
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

            {/* Icons Layer */}
            {renderCells()}

            {/* Player Position Marker - Always Center */}
            <circle cx="150" cy="150" r="4" className={`${playerColor} transition-colors duration-300 drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]`} />
        </svg>
      </div>
    </div>
  );
};