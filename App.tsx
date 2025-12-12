import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Artifact, CoinData, ArtifactType } from './types'; 
import { generateArtifact, getCellType, CellType, XP_VALUES } from './utils/gameLogic';
import { ScannerGrid } from './components/ScannerGrid';
import { EventLog } from './components/EventLog';
import { InventoryView } from './components/InventoryView';
import { ArtifactRenderer } from './components/ArtifactRenderer'; 
import { DesignWorkbench } from './components/DesignWorkbench'; 
import { ShoppingBag, ScanLine, MapPin, Radar, ShieldAlert } from 'lucide-react';

// New Imports for GPS and Storage
import { latLonToMeters, getDistance } from './utils/geo';
import { loadGameState, saveGameState } from './utils/storage';

// Capacitor Imports
import { Geolocation } from '@capacitor/geolocation';

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
  const [sonarExpiry, setSonarExpiry] = useState<number | null>(null);
  const [immunityExpiry, setImmunityExpiry] = useState<number | null>(null); // Hostile immunity
  const [xp, setXp] = useState(0);
  
  // Ephemeral State
  const [logs, setLogs] = useState<string[]>([]);
  const [lastDiscoveredArtifact, setLastDiscoveredArtifact] = useState<Artifact | null>(null);
  const [now, setNow] = useState(Date.now()); 
  const [greenFlash, setGreenFlash] = useState(false);
  
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
  const posRef = useRef(pos); // Ref for Sonar to access latest pos without restarting loop
  const lastGpsUpdate = useRef<{ x: number, y: number } | null>(null);
  const keys = useRef<{ [key: string]: boolean }>({});
  const lastUpdate = useRef<number>(0);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null); // For Flash animation reset
  
  // Audio Context Refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const droneOscRef = useRef<OscillatorNode | null>(null);
  const droneGainRef = useRef<GainNode | null>(null);

  // Constants
  const CELL_SIZE = 60; // Meters

  useEffect(() => { visitedRef.current = visited; }, [visited]);
  useEffect(() => { posRef.current = pos; }, [pos]);

  // Derived Values
  const isHostile = cellType === 'HOSTILE';
  const isShop = cellType === 'SHOP';
  const L5 = Math.abs(cell.y) % 10;
  const I5 = Math.abs(cell.x) % 10;
  const currentKey = `${cell.x},${cell.y}`;
  const isVisited = !!visited[currentKey];
  const isImmune = immunityExpiry !== null && now < immunityExpiry;
  
  // Tool Status
  // Metal Detector is now always active with increased range (80m)
  const isDetectorBoosted = true; 
  const currentDetectorRange = 80; // Hardcoded to 80m
  
  // Sonar is now always active
  const isSonarActive = true;
  
  // Leveling Maths
  const currentLevel = Math.floor(xp / XP_VALUES.LEVEL_THRESHOLD) + 1;
  const xpInCurrentLevel = xp % XP_VALUES.LEVEL_THRESHOLD;
  const levelProgress = (xpInCurrentLevel / XP_VALUES.LEVEL_THRESHOLD) * 100;

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
          setSonarExpiry(saved.sonarExpiry);
          setImmunityExpiry(saved.immunityExpiry);
          setManualMode(saved.manualMode);
          setXp(saved.xp);
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
          sonarExpiry,
          immunityExpiry,
          manualMode,
          xp
      });
  }, [hp, balance, inventory, visited, detectorExpiry, sonarExpiry, immunityExpiry, manualMode, view, xp]);


  // --- 3. MOVEMENT ENGINE (GPS + MANUAL) ---
  
  // Start GPS Watcher when entering SCANNER mode
  useEffect(() => {
      if (view === 'START') return;
      if (manualMode) return; // Don't use GPS in manual mode

      let watchId: string | null = null;

      const startWatching = async () => {
          try {
              // Request permissions explicitly for Android 10+
              const perm = await Geolocation.requestPermissions();
              
              if (perm.location === 'granted') {
                  // Capacitor Watch Position
                  watchId = await Geolocation.watchPosition(
                      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
                      (position, err) => {
                          if (err) {
                              console.error("GPS Error", err);
                              addLog(`ERR: Signal Lost (${err.message})`);
                              return;
                          }

                          if (position) {
                                const { latitude, longitude } = position.coords;
                                setGps({ lat: latitude, lon: longitude });
                                
                                // Convert to Game Grid Meters
                                const newMeters = latLonToMeters(latitude, longitude);

                                // Drift Protection: Only update if moved > 2 meters
                                if (!lastGpsUpdate.current || getDistance(lastGpsUpdate.current, newMeters) > 2) {
                                    setPos(newMeters);
                                    lastGpsUpdate.current = newMeters;
                                }
                          }
                      }
                  );
              } else {
                  addLog("ERR: Location Permission Denied");
              }
          } catch (e) {
              console.error("GPS Init Failed", e);
              addLog(`ERR: GPS Init Failed: ${e instanceof Error ? e.message : String(e)}`);
          }
      };

      startWatching();

      return () => {
          if (watchId) {
              Geolocation.clearWatch({ id: watchId });
          }
      };
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

  // Cell Entry Logic (Update Cell Type & Visited)
  useEffect(() => {
    // Prevent background logic running on start screen
    if (view !== 'SCANNER') return;

    const type = getCellType(cell.x, cell.y);
    setCellType(type);
    const key = `${cell.x},${cell.y}`;
    const wasVisited = visitedRef.current[key];
    
    // Auto-visit EMPTY cells immediately
    if (type === 'EMPTY' && !wasVisited) {
        addLog(`Area Empty. +${XP_VALUES.SCAN_EMPTY} XP.`);
        setVisited(prev => ({ ...prev, [key]: 'EMPTY' }));
        setXp(p => p + XP_VALUES.SCAN_EMPTY);
    }

    if (type === 'HOSTILE') {
        if (!wasVisited) {
            addLog("ALERT: HOSTILE ENTITY DETECTED.");
        }
        setVisited(prev => ({ ...prev, [key]: 'HOSTILE' }));
    }
    
    if (type === 'SHOP' && !wasVisited) {
        setView('SHOP');
        setVisited(prev => ({ ...prev, [key]: 'SHOP' }));
    }

    // Auto-consume food logic
    if (type === 'FOOD' && !wasVisited) {
         const I5 = Math.abs(cell.x) % 10;
         const heal = (I5 * 2.5) + 10;
         setHp(prev => Math.min(100, prev + heal));
         addLog(`Food Consumed. +${heal.toFixed(0)} HP / +${XP_VALUES.SCAN_FOOD} XP.`);
         setVisited(prev => ({...prev, [key]: 'FOOD'}));
         setXp(p => p + XP_VALUES.SCAN_FOOD);
         
         // Trigger Flash
         setGreenFlash(true);
         if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
         // Hold bright for 200ms, then let CSS transition take over to fade out
         flashTimeoutRef.current = setTimeout(() => setGreenFlash(false), 200); 
    }
  }, [cell, addLog, view]); 

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

  // Hostile Damage - STRICTLY PAUSED WHEN NOT IN SCANNER OR IMMUNE
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isHostile && view === 'SCANNER' && !isImmune) {
        // Slowed down to 2000ms (2 seconds)
        interval = setInterval(() => {
            setHp(prev => Math.max(0, prev - ((L5 % 10) + 1)));
        }, 2000);
    }
    return () => clearInterval(interval);
  }, [isHostile, L5, view, isImmune]);

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
                addLog(`Vital Signs Critical. Emergency Stasis.`);
             }
             return h;
        });
    }, 1000);
    return () => clearInterval(timer);
  }, [view, addLog]);

  // --- AUDIO LOGIC ---
  const playBeep = () => {
    if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') ctx.resume();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.1);
    
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);

    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  };

  // Continuous Drone for Hostile Cells
  useEffect(() => {
    // We play the drone if in a hostile cell in scanner mode
    // We do this regardless of immunity to warn the player they are in a danger zone
    const shouldPlay = isHostile && view === 'SCANNER';
    
    if (shouldPlay) {
        if (!audioCtxRef.current) {
             audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        const ctx = audioCtxRef.current;
        if (ctx.state === 'suspended') ctx.resume();

        // Start if not already playing
        if (!droneOscRef.current) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            
            osc.connect(gain);
            gain.connect(ctx.destination);
            
            // Ominous Drone: Low frequency Sawtooth
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(55, ctx.currentTime); // Low A
            
            // Soft fade in
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 1);
            
            osc.start();
            
            droneOscRef.current = osc;
            droneGainRef.current = gain;
        }
    } else {
        // Stop if playing
        if (droneOscRef.current && droneGainRef.current && audioCtxRef.current) {
            const osc = droneOscRef.current;
            const gain = droneGainRef.current;
            const ctx = audioCtxRef.current;
            
            // Fade out
            try {
                gain.gain.cancelScheduledValues(ctx.currentTime);
                gain.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
                osc.stop(ctx.currentTime + 0.5);
            } catch (e) {
                // Ignore audio context errors on cleanup
            }
            
            droneOscRef.current = null;
            droneGainRef.current = null;
        }
    }

    // Unmount cleanup handled by ref check
  }, [isHostile, view]);

  // Sonar Loop
  useEffect(() => {
      let timeoutId: ReturnType<typeof setTimeout>;
      let isRunning = true;

      const pingLoop = () => {
          if (!isRunning) return;
          if (!isSonarActive || view !== 'SCANNER') {
              timeoutId = setTimeout(pingLoop, 1000);
              return;
          }

          const currentPos = posRef.current; // Get latest meter position directly
          const cx = Math.floor(currentPos.x / CELL_SIZE);
          const cy = Math.floor(currentPos.y / CELL_SIZE);
          
          // Radial Scan: Check 9x9 area (approx 240m radius) for candidate cells
          let minDistanceMeters = Infinity;
          
          for (let dx = -4; dx <= 4; dx++) {
              for (let dy = -4; dy <= 4; dy++) {
                  const targetX = cx + dx;
                  const targetY = cy + dy;
                  const targetKey = `${targetX},${targetY}`;

                  // Only check unvisited COINs
                  if (!visitedRef.current[targetKey]) {
                       // Deterministic check (lightweight)
                       const type = getCellType(targetX, targetY);
                       if (type === 'COIN') {
                           // Calculate center of target cell in Meters
                           const cellCenterX = (targetX * CELL_SIZE) + (CELL_SIZE / 2);
                           const cellCenterY = (targetY * CELL_SIZE) + (CELL_SIZE / 2);
                           
                           // Euclidean Distance
                           const dist = Math.sqrt(
                               Math.pow(cellCenterX - currentPos.x, 2) + 
                               Math.pow(cellCenterY - currentPos.y, 2)
                           );
                           
                           if (dist < minDistanceMeters) {
                               minDistanceMeters = dist;
                           }
                       }
                  }
              }
          }

          // Max Audible Range: 100 Meters
          const MAX_RANGE = 100; 
          
          if (minDistanceMeters <= MAX_RANGE) {
              playBeep();
              
              // Steeper Curve Calculation
              // t is 0.0 (close) to 1.0 (far)
              const t = minDistanceMeters / MAX_RANGE; 
              
              // Quadratic curve: Makes values stay low (fast) for longer when close
              // Close (0m) -> 100ms
              // Mid (50m, t=0.5) -> 100 + 0.25*1900 = 575ms
              // Far (100m, t=1.0) -> 100 + 1900 = 2000ms
              const interval = 100 + (Math.pow(t, 2) * 1900);
              
              timeoutId = setTimeout(pingLoop, interval);
          } else {
              // Nothing nearby, check again in 1s
              timeoutId = setTimeout(pingLoop, 1000); 
          }
      };

      pingLoop();

      return () => {
          isRunning = false;
          clearTimeout(timeoutId);
      };
  }, [isSonarActive, view]); 


  // --- 5. ACTIONS ---
  const handleStart = () => {
      // Resume Audio Context if exists
      if (audioCtxRef.current?.state === 'suspended') {
          audioCtxRef.current.resume();
      }
      
      // Initialize GPS
      if (manualMode) {
          setGps({ lat: 51.505, lon: -0.09 }); 
          setView('SCANNER');
          addLog("DEV: Manual Mode Active.");
      } else {
          // The useEffect responsible for GPS will take over when view becomes SCANNER
          setView('SCANNER');
          addLog("System Online. Awaiting GPS...");
      }
  };

  const handleDevBypass = () => {
      setManualMode(true);
      setGps({ lat: 51.505, lon: -0.09 }); 
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
        addLog(`Area Empty. +${XP_VALUES.SCAN_EMPTY} XP.`);
        setVisited(p => ({...p, [currentKey]: 'EMPTY'}));
        setXp(p => p + XP_VALUES.SCAN_EMPTY);
    } else if (cellType === 'COIN') {
        const newArtifact = generateArtifact(cell.x, cell.y);
        setLastDiscoveredArtifact(newArtifact);
        setInventory(prev => [newArtifact, ...prev]);
        setView('DISCOVERY');
        addLog(`Excavation Successful. +${XP_VALUES.SCAN_ITEM} XP.`);
        setVisited(p => ({...p, [currentKey]: 'COIN'}));
        setXp(p => p + XP_VALUES.SCAN_ITEM);
    }
  };

  const handleRevive = (itemsToSell: Artifact[]) => {
      handleSell(itemsToSell);
      // Deduct the medical bill ($1000)
      setBalance(prev => prev - 1000);
      setHp(50);
      setImmunityExpiry(Date.now() + 60000); // 1 Minute Immunity
      setView('SCANNER');
      addLog("Medical Bill Paid. Immunity Active (60s).");
  };

  const handleDirectPayRevive = () => {
      if (balance >= 1000) {
          setBalance(prev => prev - 1000);
          setHp(50);
          setImmunityExpiry(Date.now() + 60000); // 1 Minute Immunity
          setView('SCANNER');
          addLog("Medical Bill Paid. Immunity Active (60s).");
      }
  };

  const handleSell = (itemsToSell: Artifact[]) => {
      const value = itemsToSell.reduce((acc, c) => acc + c.monetaryValue, 0);
      setInventory(prev => prev.filter(item => !itemsToSell.includes(item)));
      setBalance(prev => prev + value);
      addLog(`Assets Liquidated. +$${value.toLocaleString()}.`);
  };

  const buyRangeBoost = () => {
      // Disabled in shop
  };

  const buySonar = () => {
      // Disabled in shop
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
      <div className="absolute top-0 left-0 w-full p-4 z-20 pointer-events-none bg-gradient-to-b from-black to-transparent flex justify-between items-start">
            
            {/* LEFT COLUMN: Stats (HP & LVL) */}
            <div className="flex flex-col gap-1.5">
                {/* HP BAR ROW */}
                <div className={`flex items-center gap-3 text-xs font-bold transition-colors duration-300 ${hp < 20 ? 'text-red-500 animate-pulse' : 'text-white'}`}>
                    <span className="w-12 text-right tabular-nums">HP {hp.toFixed(0)}</span>
                    <div className="w-24 h-2 bg-zinc-900 rounded-full overflow-hidden border border-zinc-800">
                        <div 
                            className={`h-full transition-all duration-300 ${hp < 20 ? 'bg-red-600' : 'bg-white'}`} 
                            style={{ width: `${hp}%` }}
                        ></div>
                    </div>
                </div>

                {/* LVL BAR ROW */}
                <div className="flex items-center gap-3 text-xs font-bold text-yellow-500">
                    <span className="w-12 text-right tabular-nums">LVL {currentLevel}</span>
                    <div className="w-24 h-2 bg-zinc-900 rounded-full overflow-hidden border border-zinc-800">
                        <div 
                            className="h-full bg-yellow-600 transition-all duration-500" 
                            style={{ width: `${levelProgress}%` }}
                        ></div>
                    </div>
                </div>
            </div>

            {/* RIGHT COLUMN: Info (Balance & Timer) */}
            <div className="flex flex-col items-end gap-2">
                <div className="flex items-center gap-2">
                    <span className="text-white font-bold text-xs">${balance.toLocaleString()}</span>
                </div>

                 {/* Immunity Timer */}
                 {isImmune && (
                    <div className="flex items-center gap-2 text-[10px] text-blue-400 bg-blue-900/20 px-2 py-1 rounded border border-blue-900/50 animate-pulse">
                        <ShieldAlert size={10} />
                        <span>IMMUNITY ACTIVE</span>
                    </div>
                 )}

                 {/* Tools are now always active, hiding labels as requested */}
            </div>
      </div>

      {/* 2. MAIN VIEW: SCANNER */}
      <div className={`absolute inset-0 flex flex-col transition-opacity duration-500 ${view === 'SCANNER' ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
            
            {/* Background Hostile Effect */}
            {isHostile && !isImmune && <div className="absolute inset-0 bg-red-900/20 animate-pulse pointer-events-none z-10"></div>}
            {isHostile && isImmune && <div className="absolute inset-0 bg-blue-900/10 pointer-events-none z-10"></div>}
            
            {/* Food Flash Effect - Always mounted for transition stability */}
            <div className={`absolute inset-0 bg-green-500/20 pointer-events-none z-10 transition-opacity ${greenFlash ? 'duration-0 opacity-100' : 'duration-[1500ms] opacity-0'}`}></div>

            {/* The Grid */}
            <div className="flex-1 flex items-center justify-center relative">
                <ScannerGrid 
                    isHostile={isHostile} 
                    playerPos={pos}
                    visited={visited}
                    detectorRange={currentDetectorRange}
                    gps={gps}
                />
            </div>

            {/* Log */}
            <div className="z-20">
               <EventLog logs={logs} />
            </div>

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
                    {/* Prioritize 'Area Cleared' over 'Analyzing...' to prevent flashing on auto-visited empty cells */}
                    {hp <= 0 ? 'Exhausted' : isShop && isVisited ? 'Enter Shop' : isVisited ? 'Area Cleared' : isAnalyzing ? 'Analyzing...' : 'Excavate'}
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
                
                isDetectorActive={isDetectorBoosted}
                onToggleDetector={() => setDetectorExpiry(isDetectorBoosted ? null : Date.now() + 10 * 60 * 1000)}
                
                isSonarActive={isSonarActive}
                onToggleSonar={() => setSonarExpiry(isSonarActive ? null : Date.now() + 5 * 60 * 1000)}
                
                onDevAddCash={() => { setBalance(b => b+10000); addLog("DEV: +$10k"); }}
                onOpenWorkbench={() => setView('WORKBENCH')}
            />
      )}

      {view === 'WORKBENCH' && <DesignWorkbench onClose={() => setView('INVENTORY')} />}

      {view === 'SHOP' && (
            <div className="absolute inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-6 animate-in fade-in zoom-in duration-300">
                    <ShoppingBag size={48} className="text-white mb-6" />
                    
                    <div className="w-full space-y-4 mb-8">
                        {/* Metal Detector Upgrade */}
                        <div className="bg-zinc-900 border border-zinc-700 p-4 rounded-lg flex items-center justify-between opacity-50">
                            <div className="flex items-center gap-3">
                                    <div className="bg-green-900/30 p-2 rounded text-green-400">
                                    <ScanLine size={24} />
                                    </div>
                                    <div className="text-left">
                                        <div className="text-white text-sm font-bold">Standard Detector</div>
                                        <div className="text-zinc-500 text-[10px]">80m Range Enabled</div>
                                    </div>
                            </div>
                            <div className="flex flex-col items-end gap-2">
                                <span className="text-zinc-600 font-mono text-sm">--</span>
                                <button 
                                    disabled
                                    className="bg-zinc-800 text-zinc-500 text-[10px] font-bold px-3 py-1 rounded uppercase tracking-wider cursor-not-allowed"
                                >
                                    EQUIPPED
                                </button>
                            </div>
                        </div>

                        {/* Sonar */}
                        <div className="bg-zinc-900 border border-zinc-700 p-4 rounded-lg flex items-center justify-between opacity-50">
                            <div className="flex items-center gap-3">
                                    <div className="bg-indigo-900/30 p-2 rounded text-indigo-400">
                                    <Radar size={24} />
                                    </div>
                                    <div className="text-left">
                                        <div className="text-white text-sm font-bold">Sonar Module</div>
                                        <div className="text-zinc-500 text-[10px]">Always Active</div>
                                    </div>
                            </div>
                            <div className="flex flex-col items-end gap-2">
                                <span className="text-zinc-600 font-mono text-sm">--</span>
                                <button 
                                    disabled
                                    className="bg-zinc-800 text-zinc-500 text-[10px] font-bold px-3 py-1 rounded uppercase tracking-wider cursor-not-allowed"
                                >
                                    EQUIPPED
                                </button>
                            </div>
                        </div>
                    </div>

                    <button 
                    onClick={() => setView('SCANNER')}
                    className="text-zinc-500 text-xs hover:text-white mt-4"
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
                        <p className="text-zinc-500 text-xs uppercase flex items-center justify-center gap-2">
                            {(lastDiscoveredArtifact.data as CoinData).condition} • {formatYear((lastDiscoveredArtifact.data as CoinData).year)} 
                            <span className="px-1.5 py-0.5 bg-black/80 border border-zinc-800 rounded text-[10px] text-yellow-500 font-mono">
                                {lastDiscoveredArtifact.rarityScore.toFixed(1)}
                            </span>
                        </p>
                        <div className="inline-block px-3 py-1 bg-zinc-900 border border-zinc-800 rounded text-xs text-green-400 mt-2">
                            VALUE: ${lastDiscoveredArtifact.monetaryValue.toLocaleString()}
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