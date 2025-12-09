import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Artifact, CoinData, ArtifactType } from './types'; 
import { generateArtifact, getCellType, CellType } from './utils/gameLogic';
import { ScannerGrid } from './components/ScannerGrid';
import { EventLog } from './components/EventLog';
import { InventoryView } from './components/InventoryView';
import { ArtifactRenderer } from './components/ArtifactRenderer'; 
import { DesignWorkbench } from './components/DesignWorkbench'; 
import { ShoppingBag, ScanLine, MapPin } from 'lucide-react';

// New Imports for GPS and Storage
import { latLonToMeters, getDistance, formatCoordinate } from './utils/geo';
import { loadGameState, saveGameState } from './utils/storage';

type ViewState = 'START' | 'SCANNER' | 'INVENTORY' | 'DISCOVERY' | 'EXHAUSTION' | 'SHOP' | 'WORKBENCH';
type VisitedMap = Record<string, CellType>;

export default function App() {
  // --- 1. GAME STATE ---
  const [view, setView] = useState<ViewState>('START');
  
  // Persisted State
  const [hp, setHp] = useState(50);
  const [balance, setBalance] = useState(0); 
  const [inventory, setInventory] = useState<Artifact[]>([]);
  const [visited, setVisited] = useState<VisitedMap>({});
  const [detectorExpiry, setDetectorExpiry] = useState<number | null>(null);
  
  // Ephemeral State
  const [logs, setLogs] = useState<string[]>([]);
  const [lastDiscoveredArtifact, setLastDiscoveredArtifact] = useState<Artifact | null>(null);
  const [now, setNow] = useState(Date.now()); 
  
  // Developer Mode State
  const [devInstantScan, setDevInstantScan] = useState(false);
  const [manualMode, setManualMode] = useState(false);

  // Position State
  const [pos, setPos] = useState({ x: 1000, y: 1000 }); // Game Grid Meters
  const [gps, setGps] = useState<{lat: number, lon: number} | null>(null);
  const [cell, setCell] = useState({ x: 0, y: 0 });
  const [cellType, setCellType] = useState<CellType>('EMPTY');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Refs for logic
  const visitedRef = useRef(visited);
  const lastGpsUpdate = useRef<{ x: number, y: number } | null>(null);
  const keys = useRef<{ [key: string]: boolean }>({});
  const lastUpdate = useRef<number>(0);

  // Constants
  const CELL_SIZE = 60; // Meters

  useEffect(() => { visitedRef.current = visited; }, [visited]);

  // Derived Values
  const isHostile = cellType === 'HOSTILE';
  const isShop = cellType === 'SHOP';
  const L5 = Math.abs(cell.y) % 10;
  const I5 = Math.abs(cell.x) % 10;
  const currentKey = `${cell.x},${cell.y}`;
  const isVisited = !!visited[currentKey];
  const isDetectorActive = detectorExpiry !== null && now < detectorExpiry;
  const detectorTimeLeft = detectorExpiry ? Math.max(0, Math.ceil((detectorExpiry - now) / 1000)) : 0;

  const addLog = useCallback((msg: string) => {
    setLogs(prev => [...prev.slice(-49), msg]); 
  }, []);

  // --- 2. INITIALIZATION & STORAGE ---
  useEffect(() => {
      const saved = loadGameState();
      if (saved) {
          setHp(saved.hp);
          setBalance(saved.balance);
          setInventory(saved.inventory);
          setVisited(saved.visited);
          setDetectorExpiry(saved.detectorExpiry);
          setManualMode(saved.manualMode);
          addLog("System: Save State Loaded.");
      } else {
          addLog("System: Initial Boot Sequence.");
      }
  }, [addLog]);

  // Auto-Save Effect (Triggered on key state changes)
  useEffect(() => {
      if (view === 'START') return;
      saveGameState({
          hp,
          balance,
          inventory,
          visited,
          detectorExpiry,
          manualMode
      });
  }, [hp, balance, inventory, visited, detectorExpiry, manualMode, view]);


  // --- 3. MOVEMENT ENGINE (GPS + MANUAL) ---
  
  // Start GPS Watcher when entering SCANNER mode
  useEffect(() => {
      if (view === 'START') return;
      if (manualMode) return; // Don't use GPS in manual mode

      if ('geolocation' in navigator) {
          const watchId = navigator.geolocation.watchPosition(
              (position) => {
                  const { latitude, longitude } = position.coords;
                  setGps({ lat: latitude, lon: longitude });
                  
                  // Convert to Game Grid Meters
                  const newMeters = latLonToMeters(latitude, longitude);

                  // Drift Protection: Only update if moved > 2 meters
                  if (!lastGpsUpdate.current || getDistance(lastGpsUpdate.current, newMeters) > 2) {
                      setPos(newMeters);
                      lastGpsUpdate.current = newMeters;
                  }
              },
              (err) => {
                  console.error("GPS Error", err);
                  addLog("ERR: GPS Signal Lost.");
              },
              { enableHighAccuracy: true, maximumAge: 0 }
          );
          return () => navigator.geolocation.clearWatch(watchId);
      }
  }, [view, manualMode, addLog]);

  // Manual Movement Loop (Dev Mode)
  useEffect(() => {
    if (!manualMode) return;
    
    const handleKeyDown = (e: KeyboardEvent) => { keys.current[e.code] = true; };
    const handleKeyUp = (e: KeyboardEvent) => { keys.current[e.code] = false; };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    const loop = (time: number) => {
      const delta = time - lastUpdate.current;
      if (delta > 16) { 
        lastUpdate.current = time;
        let dx = 0; 
        let dy = 0;
        const speed = 2.0; // Faster in manual mode (covers more ground)

        if (keys.current['ArrowUp'] || keys.current['KeyW']) dy += speed;
        if (keys.current['ArrowDown'] || keys.current['KeyS']) dy -= speed;
        if (keys.current['ArrowRight'] || keys.current['KeyD']) dx += speed;
        if (keys.current['ArrowLeft'] || keys.current['KeyA']) dx -= speed;

        if (dx !== 0 || dy !== 0) {
          setPos(prev => ({ x: prev.x + dx, y: prev.y + dy }));
          // Fake GPS update for display
          setGps(prev => prev ? { lat: prev.lat + (dy/111111), lon: prev.lon + (dx/111111) } : null);
        }
      }
      requestAnimationFrame(loop);
    };
    const frameId = requestAnimationFrame(loop);
    return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
        cancelAnimationFrame(frameId);
    }
  }, [manualMode]);


  // --- 4. GAME LOGIC UPDATES ---

  // Update Cell
  useEffect(() => {
    const currentCellX = Math.floor(pos.x / CELL_SIZE);
    const currentCellY = Math.floor(pos.y / CELL_SIZE);
    if (currentCellX !== cell.x || currentCellY !== cell.y) {
        setCell({ x: currentCellX, y: currentCellY });
    }
  }, [pos.x, pos.y, cell.x, cell.y]);

  // Cell Entry Logic
  useEffect(() => {
    const type = getCellType(cell.x, cell.y);
    setCellType(type);
    const key = `${cell.x},${cell.y}`;
    
    if (type === 'HOSTILE') {
        if (!visitedRef.current[key]) addLog("Warning you are in a Hostile area. Get out!");
        setVisited(prev => ({ ...prev, [key]: 'HOSTILE' }));
    }
    
    if (type === 'SHOP' && !visitedRef.current[key]) {
        setView('SHOP');
        setVisited(prev => ({ ...prev, [key]: 'SHOP' }));
    }
  }, [cell, addLog]); 

  // Analyzing Timer
  useEffect(() => {
    if (devInstantScan) {
        setIsAnalyzing(false);
    } else {
        setIsAnalyzing(true);
        // Reduced to 3 seconds
        const analyzeTimer = setTimeout(() => setIsAnalyzing(false), 3000);
        return () => clearTimeout(analyzeTimer);
    }
  }, [cell, devInstantScan]);

  // Hostile Damage - STRICTLY PAUSED WHEN NOT IN SCANNER
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isHostile && view === 'SCANNER') {
        // Slowed down to 2000ms (2 seconds)
        interval = setInterval(() => {
            setHp(prev => Math.max(0, prev - ((L5 % 10) + 1)));
        }, 2000);
    }
    return () => clearInterval(interval);
  }, [isHostile, L5, view]);

  // Passive HP Drain - STRICTLY PAUSED WHEN NOT IN SCANNER
  useEffect(() => {
      const metabolicInterval = setInterval(() => {
          if (view === 'SCANNER' && hp > 0) {
              setHp(prev => Math.max(0, prev - 1));
          }
      }, 12000);
      return () => clearInterval(metabolicInterval);
  }, [view, hp]);

  // Global Timer (Exhaustion Check)
  useEffect(() => {
    const timer = setInterval(() => {
        setNow(Date.now());
        setHp(h => {
             // Only trigger exhaustion if we aren't already there and not on start screen
             if (h <= 0 && view !== 'EXHAUSTION' && view !== 'START') {
                setView('EXHAUSTION');
             }
             return h;
        });
    }, 1000);
    return () => clearInterval(timer);
  }, [view]);


  // --- 5. ACTIONS ---
  const handleStart = () => {
      // Request Permission
      if ('geolocation' in navigator) {
          navigator.geolocation.getCurrentPosition(
              (pos) => {
                  const m = latLonToMeters(pos.coords.latitude, pos.coords.longitude);
                  setPos(m);
                  setGps({ lat: pos.coords.latitude, lon: pos.coords.longitude });
                  setView('SCANNER');
                  addLog("GPS Connected. System Online.");
              },
              (err) => alert("GPS Permission is required to play.")
          );
      } else {
          alert("GPS not supported on this device.");
      }
  };

  const handleDevBypass = () => {
      setManualMode(true);
      setView('SCANNER');
      addLog("DEV: System Bypassed. Manual Mode ON.");
  };

  const handleScan = () => {
    if (hp <= 0) return;
    if (isShop && isVisited) {
        setView('SHOP');
        return;
    }
    if (isVisited) return; 

    if (cellType === 'EMPTY') {
        addLog(`Area Empty.`);
        setVisited(p => ({...p, [currentKey]: 'EMPTY'}));
    } else if (cellType === 'FOOD') {
        const heal = (I5 * 2.5) + 10;
        setHp(prev => Math.min(100, prev + heal));
        addLog(`Rations Found. +${heal.toFixed(0)} HP.`);
        setVisited(p => ({...p, [currentKey]: 'FOOD'}));
    } else if (cellType === 'COIN') {
        const newArtifact = generateArtifact(cell.x, cell.y);
        setLastDiscoveredArtifact(newArtifact);
        setInventory(prev => [newArtifact, ...prev]);
        setView('DISCOVERY');
        addLog(`Excavation Successful.`);
        setVisited(p => ({...p, [currentKey]: 'COIN'}));
    }
  };

  const handleRevive = (itemsToSell: Artifact[]) => {
      handleSell(itemsToSell);
      // Deduct the medical bill ($1000)
      setBalance(prev => prev - 1000);
      setHp(50);
      setView('SCANNER');
      addLog("Medical Bill Paid.");
  };

  const handleDirectPayRevive = () => {
      if (balance >= 1000) {
          setBalance(prev => prev - 1000);
          setHp(50);
          setView('SCANNER');
          addLog("Medical Bill Paid.");
      }
  };

  const handleSell = (itemsToSell: Artifact[]) => {
      const value = itemsToSell.reduce((acc, c) => acc + c.monetaryValue, 0);
      setInventory(prev => prev.filter(item => !itemsToSell.includes(item)));
      setBalance(prev => prev + value);
      addLog(`Assets Liquidated. +$${value.toLocaleString()}.`);
  };

  const buyDetector = () => {
      if (balance >= 5000) {
          setBalance(prev => prev - 5000);
          setDetectorExpiry(Date.now() + 10 * 60 * 1000); 
          addLog("Metal Detector Equipped.");
          setView('SCANNER');
      }
  };
  
  const formatYear = (year: number) => {
      return year > 0 ? `${year} AD` : `${Math.abs(year)} BC`;
  };

  // --- RENDERING ---

  if (view === 'START') {
      return (
          <div className="fixed inset-0 bg-black flex flex-col items-center justify-center p-8 text-center font-mono space-y-8">
              <ScanLine size={64} className="text-white animate-pulse" />
              <div>
                  <h1 className="text-4xl font-bold text-white mb-2 tracking-tighter">C-36 GRID</h1>
                  <p className="text-zinc-500 text-sm">REAL WORLD DISCOVERY ENGINE</p>
              </div>
              <div className="max-w-xs text-xs text-zinc-400 leading-relaxed border border-zinc-800 p-4 rounded">
                  This application requires GPS access to function. 
                  <br/><br/>
                  The grid is overlaid on the physical world. 
                  Move physically to explore cells.
              </div>
              <button 
                onClick={handleStart}
                className="bg-white text-black px-8 py-4 font-bold rounded uppercase tracking-widest hover:bg-zinc-200"
              >
                  Initialize System
              </button>
              
              <button 
                onClick={handleDevBypass}
                className="text-zinc-700 text-[10px] hover:text-zinc-500 uppercase tracking-widest mt-8"
              >
                  Dev Bypass (Manual Mode)
              </button>
          </div>
      );
  }

  return (
    <div className="fixed inset-0 bg-black text-white font-mono overflow-hidden">
      
      {/* 1. HUD HEADER */}
      <div className="absolute top-0 left-0 w-full p-4 z-20 pointer-events-none bg-gradient-to-b from-black to-transparent">
            {/* Top Row: HP and Balance */}
            <div className="flex items-center justify-between mb-2">
                <div className={`flex items-center gap-2 text-xs font-bold ${hp < 20 ? 'text-red-500 animate-pulse' : 'text-white'}`}>
                    <span>HP {hp.toFixed(0)}</span>
                    <div className="w-24 h-2 bg-zinc-900 rounded-full overflow-hidden border border-zinc-800">
                        <div className={`h-full ${hp < 20 ? 'bg-red-600' : 'bg-white'}`} style={{ width: `${hp}%` }}></div>
                    </div>
                </div>
                
                <div className="flex items-center gap-2">
                    <span className="text-white font-bold text-xs">${balance.toLocaleString()}</span>
                </div>
            </div>

            {/* Coordinates & Status */}
            <div className="flex justify-between items-end">
                 <div className="text-[10px] text-zinc-600 flex flex-col">
                     {gps && <span className="flex items-center gap-1"><MapPin size={8}/> {formatCoordinate(gps.lat, gps.lon)}</span>}
                     <span>GRID: {Math.floor(pos.x)}, {Math.floor(pos.y)}</span>
                 </div>
                 {isDetectorActive && (
                    <div className="flex items-center gap-2 text-[10px] text-green-400 bg-green-900/20 px-2 py-1 rounded border border-green-900/50">
                        <ScanLine size={10} />
                        <span>{Math.floor(detectorTimeLeft/60)}:{(detectorTimeLeft%60).toString().padStart(2,'0')}</span>
                    </div>
                 )}
            </div>
      </div>

      {/* 2. MAIN VIEW: SCANNER */}
      <div className={`absolute inset-0 flex flex-col transition-opacity duration-500 ${view === 'SCANNER' ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
            
            {/* Background Hostile Effect */}
            {isHostile && <div className="absolute inset-0 bg-red-900/20 animate-pulse pointer-events-none"></div>}

            {/* The Grid */}
            <div className="flex-1 flex items-center justify-center relative pt-12">
                <ScannerGrid 
                    isHostile={isHostile} 
                    playerPos={pos}
                    visited={visited}
                    isDetectorActive={isDetectorActive}
                />
            </div>

            {/* Log */}
            <EventLog logs={logs} />

            {/* Controls */}
            <div className="p-6 pb-8 bg-black flex gap-4 items-center border-t border-zinc-900 z-30">
                <button 
                    onClick={() => setView('INVENTORY')}
                    className="p-4 rounded-full border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors"
                >
                    <ShoppingBag size={20} />
                </button>
                <button 
                    onClick={handleScan}
                    disabled={hp <= 0 || (isVisited && !isShop) || isAnalyzing}
                    className={`flex-1 font-bold h-14 rounded-lg tracking-widest active:scale-95 transition-all text-sm uppercase shadow-[0_0_15px_rgba(255,255,255,0.2)] disabled:shadow-none ${
                        isShop && isVisited 
                        ? 'bg-blue-600 text-white hover:bg-blue-500' 
                        : 'bg-white text-black disabled:bg-zinc-800 disabled:text-zinc-500 hover:bg-zinc-200' 
                    }`}
                >
                    {hp <= 0 ? 'Exhausted' : isAnalyzing ? 'Analyzing...' : isShop && isVisited ? 'Enter Shop' : isVisited ? 'Area Cleared' : 'Excavate'}
                </button>
            </div>
      </div>

      {/* 3. OVERLAYS */}
      {(view === 'INVENTORY' || view === 'EXHAUSTION') && (
            <InventoryView 
                items={inventory} 
                onClose={() => setView('SCANNER')} 
                mode={view === 'EXHAUSTION' ? 'REVIVE' : 'VIEW'}
                onRevive={handleRevive}
                onPayRevive={handleDirectPayRevive}
                onSell={handleSell}
                balance={balance}
                devInstantScan={devInstantScan}
                onToggleDevInstantScan={() => setDevInstantScan(!devInstantScan)}
                manualMode={manualMode}
                onToggleManualMovement={() => setManualMode(!manualMode)}
                onDevAddCash={() => { setBalance(b => b+10000); addLog("DEV: +$10k"); }}
                onDevEnableDetector={() => { setDetectorExpiry(Date.now()+600000); addLog("DEV: Detector ON"); }}
                onOpenWorkbench={() => setView('WORKBENCH')}
            />
      )}

      {view === 'WORKBENCH' && <DesignWorkbench onClose={() => setView('INVENTORY')} />}

      {view === 'SHOP' && (
            <div className="absolute inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-6 animate-in fade-in zoom-in duration-300">
                    <ShoppingBag size={48} className="text-white mb-6" />
                    
                    <div className="bg-zinc-900 border border-zinc-700 p-4 rounded-lg w-full mb-8 flex items-center justify-between mt-8">
                    <div className="flex items-center gap-3">
                            <div className="bg-green-900/30 p-2 rounded text-green-400">
                            <ScanLine size={24} />
                            </div>
                            <div className="text-left">
                                <div className="text-white text-sm font-bold">Metal Detector</div>
                                <div className="text-zinc-500 text-[10px]">10m Battery Life</div>
                            </div>
                    </div>
                    <div className="text-green-400 font-mono text-sm">$5,000</div>
                    </div>

                    <button 
                    onClick={buyDetector}
                    disabled={balance < 5000}
                    className={`w-full bg-white text-black font-bold py-3 rounded uppercase text-xs tracking-widest mb-4 ${balance < 5000 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-zinc-200'}`}
                    >
                    Purchase
                    </button>
                    <button 
                    onClick={() => setView('SCANNER')}
                    className="text-zinc-500 text-xs hover:text-white"
                    >
                    LEAVE
                    </button>
            </div>
        )}

      {view === 'DISCOVERY' && lastDiscoveredArtifact && (
            <div className="absolute inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-6 animate-in fade-in zoom-in duration-300">
                <div className="text-white text-sm tracking-widest uppercase mb-8 border-b border-white pb-2">
                    {lastDiscoveredArtifact.type} FOUND
                </div>
                
                <div className="w-64 h-64 flex items-center justify-center mb-8">
                    <ArtifactRenderer artifact={lastDiscoveredArtifact} />
                </div>
                
                {lastDiscoveredArtifact.type === ArtifactType.COIN && (
                     <div className="text-center space-y-2 mb-8">
                        <h2 className="text-2xl font-bold text-white">{(lastDiscoveredArtifact.data as CoinData).metal} Coin</h2>
                        <p className="text-zinc-500 text-xs uppercase">
                            {(lastDiscoveredArtifact.data as CoinData).condition} • {formatYear((lastDiscoveredArtifact.data as CoinData).year)} • {(lastDiscoveredArtifact.data as CoinData).pattern}
                        </p>
                        <div className="inline-block px-3 py-1 bg-zinc-900 border border-zinc-800 rounded text-xs text-green-400 mt-2">
                            Val: ${lastDiscoveredArtifact.monetaryValue.toLocaleString()}
                        </div>
                    </div>
                )}

                <button 
                    onClick={() => setView('SCANNER')}
                    className="w-full max-w-xs bg-white text-black font-bold py-3 rounded uppercase text-xs tracking-widest hover:bg-zinc-200"
                >
                    Collect & Close
                </button>
            </div>
      )}

      {/* Scan Lines Overlay */}
      <div className="absolute inset-0 pointer-events-none opacity-5 z-40" 
             style={{ backgroundImage: 'linear-gradient(transparent 50%, #000 50%)', backgroundSize: '100% 4px' }}>
      </div>

    </div>
  );
}