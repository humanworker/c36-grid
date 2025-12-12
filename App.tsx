import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Artifact, CoinData, ArtifactType, ItemData } from './types'; 
import { generateArtifact, getCellType, CellType, XP_VALUES, SUPERMARKET_CATALOG, TOOLSHOP_CATALOG, generateShopArtifact } from './utils/gameLogic';
import { ScannerGrid } from './components/ScannerGrid';
import { EventLog } from './components/EventLog';
import { InventoryView } from './components/InventoryView';
import { ArtifactRenderer } from './components/ArtifactRenderer'; 
import { DesignWorkbench } from './components/DesignWorkbench'; 
import { ShoppingBag, ScanLine, MapPin, Radar, ShieldAlert, ShoppingCart, Wrench } from 'lucide-react';

// New Imports for GPS and Storage
import { latLonToMeters, getDistance } from './utils/geo';
import { loadGameState, saveGameState } from './utils/storage';

// Capacitor Imports
import { Geolocation } from '@capacitor/geolocation';

type ViewState = 'START' | 'SCANNER' | 'INVENTORY' | 'DISCOVERY' | 'EXHAUSTION' | 'SUPERMARKET' | 'TOOL_SHOP' | 'WORKBENCH';
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
  const [immunityExpiry, setImmunityExpiry] = useState<number | null>(null); 
  const [xp, setXp] = useState(0);
  
  // Ephemeral State
  const [logs, setLogs] = useState<string[]>([]);
  const [lastDiscoveredArtifact, setLastDiscoveredArtifact] = useState<Artifact | null>(null);
  const [now, setNow] = useState(Date.now()); 
  const [greenFlash, setGreenFlash] = useState(false);
  const [boutiqueItems, setBoutiqueItems] = useState<Artifact[]>([]); // Infrastructure for future
  
  // Visual Feedback State (+x indicators)
  const [hpDelta, setHpDelta] = useState<number | null>(null);
  const [xpDelta, setXpDelta] = useState<number | null>(null);
  
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
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null); 
  
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
  const isSupermarket = cellType === 'SUPERMARKET';
  const isToolShop = cellType === 'TOOL_SHOP';
  const L5 = Math.abs(cell.y) % 10;
  const I5 = Math.abs(cell.x) % 10;
  const currentKey = `${cell.x},${cell.y}`;
  const isVisited = !!visited[currentKey];
  const isImmune = immunityExpiry !== null && now < immunityExpiry;
  
  // Tool Status
  const isDetectorBoosted = detectorExpiry !== null && now < detectorExpiry;
  const currentDetectorRange = isDetectorBoosted ? 120 : 80; 
  const isSonarActive = sonarExpiry !== null && now < sonarExpiry;
  
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

  // Delta clear effects
  useEffect(() => {
    if (hpDelta !== null) {
        const t = setTimeout(() => setHpDelta(null), 2000); 
        return () => clearTimeout(t);
    }
  }, [hpDelta]);

  useEffect(() => {
    if (xpDelta !== null) {
        const t = setTimeout(() => setXpDelta(null), 2000); 
        return () => clearTimeout(t);
    }
  }, [xpDelta]);

  // Spoilage Checker Loop
  useEffect(() => {
    const checkSpoilage = setInterval(() => {
        setInventory(prev => {
            let hasChanges = false;
            const nowTime = Date.now();
            const next = prev.filter(item => {
                if (item.type === ArtifactType.FOOD) {
                    const d = item.data as ItemData;
                    if (d.spoilageTimestamp && nowTime > d.spoilageTimestamp) {
                        addLog(`Pantry Alert: ${d.name} has spoiled.`);
                        hasChanges = true;
                        return false; // Remove
                    }
                }
                return true;
            });
            return hasChanges ? next : prev;
        });
    }, 60000); // Check every minute
    return () => clearInterval(checkSpoilage);
  }, [addLog]);


  // --- 3. MOVEMENT ENGINE (GPS + MANUAL) ---
  
  // Start GPS Watcher when entering SCANNER mode
  useEffect(() => {
      if (view === 'START') return;
      if (manualMode) return; 

      let watchId: string | null = null;

      const startWatching = async () => {
          try {
              const perm = await Geolocation.requestPermissions();
              
              if (perm.location === 'granted') {
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
                                
                                const newMeters = latLonToMeters(latitude, longitude);

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
        const speed = 2.0; 

        if (keys.current['ArrowUp'] || keys.current['KeyW']) dy += speed;
        if (keys.current['ArrowDown'] || keys.current['KeyS']) dy -= speed;
        if (keys.current['ArrowRight'] || keys.current['KeyD']) dx += speed;
        if (keys.current['ArrowLeft'] || keys.current['KeyA']) dx -= speed;

        if (dx !== 0 || dy !== 0) {
          setPos(prev => ({ x: prev.x + dx, y: prev.y + dy }));
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
        setXpDelta(XP_VALUES.SCAN_EMPTY);
    }

    if (type === 'HOSTILE') {
        if (!wasVisited) {
            addLog("ALERT: HOSTILE ENTITY DETECTED.");
        }
        setVisited(prev => ({ ...prev, [key]: 'HOSTILE' }));
    }
    
    if (type === 'SUPERMARKET' && !wasVisited) {
        setView('SUPERMARKET');
        setVisited(prev => ({ ...prev, [key]: 'SUPERMARKET' }));
    }

    if (type === 'TOOL_SHOP' && !wasVisited) {
        setView('TOOL_SHOP');
        setVisited(prev => ({ ...prev, [key]: 'TOOL_SHOP' }));
    }

    // Auto-consume food logic (Map Food is generic Fruit)
    if (type === 'FOOD' && !wasVisited) {
         const I5 = Math.abs(cell.x) % 10;
         const heal = (I5 * 2.5) + 10;
         const healAmount = Math.floor(heal);
         
         setHp(prev => Math.min(100, prev + heal));
         addLog(`Fruit Consumed. +${heal.toFixed(0)} HP / +${XP_VALUES.SCAN_FOOD} XP.`);
         setVisited(prev => ({...prev, [key]: 'FOOD'}));
         setXp(p => p + XP_VALUES.SCAN_FOOD);
         
         setHpDelta(healAmount);
         setXpDelta(XP_VALUES.SCAN_FOOD);
         
         setGreenFlash(true);
         if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
         flashTimeoutRef.current = setTimeout(() => setGreenFlash(false), 200);
         playPositiveChime();
    }
  }, [cell, addLog, view]); 

  // Analyzing Timer
  useEffect(() => {
    if (devInstantScan) {
        setIsAnalyzing(false);
    } else {
        setIsAnalyzing(true);
        const analyzeTimer = setTimeout(() => setIsAnalyzing(false), 3000);
        return () => clearTimeout(analyzeTimer);
    }
  }, [cell, devInstantScan]);

  // Hostile Damage
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isHostile && view === 'SCANNER' && !isImmune) {
        interval = setInterval(() => {
            setHp(prev => Math.max(0, prev - ((L5 % 10) + 1)));
        }, 2000);
    }
    return () => clearInterval(interval);
  }, [isHostile, L5, view, isImmune]);

  // Passive HP Drain
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

  const playPositiveChime = () => {
    if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') ctx.resume();

    const t = ctx.currentTime;
    
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.type = 'sine';
    osc2.type = 'sine';
    
    osc1.frequency.setValueAtTime(1046.50, t); 
    osc2.frequency.setValueAtTime(1318.51, t);

    gain.gain.setValueAtTime(0.05, t); 
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);

    osc1.start(t);
    osc2.start(t);
    osc1.stop(t + 0.5);
    osc2.stop(t + 0.5);
  };

  // Continuous Drone for Hostile Cells
  useEffect(() => {
    const shouldPlay = isHostile && view === 'SCANNER';
    
    if (shouldPlay) {
        if (!audioCtxRef.current) {
             audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        const ctx = audioCtxRef.current;
        if (ctx.state === 'suspended') ctx.resume();

        if (!droneOscRef.current) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            
            osc.connect(gain);
            gain.connect(ctx.destination);
            
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(55, ctx.currentTime); 
            
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 1);
            
            osc.start();
            
            droneOscRef.current = osc;
            droneGainRef.current = gain;
        }
    } else {
        if (droneOscRef.current && droneGainRef.current && audioCtxRef.current) {
            const osc = droneOscRef.current;
            const gain = droneGainRef.current;
            const ctx = audioCtxRef.current;
            
            try {
                gain.gain.cancelScheduledValues(ctx.currentTime);
                gain.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
                osc.stop(ctx.currentTime + 0.5);
            } catch (e) {
            }
            
            droneOscRef.current = null;
            droneGainRef.current = null;
        }
    }
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

          const currentPos = posRef.current; 
          const cx = Math.floor(currentPos.x / CELL_SIZE);
          const cy = Math.floor(currentPos.y / CELL_SIZE);
          
          let minDistanceMeters = Infinity;
          
          for (let dx = -4; dx <= 4; dx++) {
              for (let dy = -4; dy <= 4; dy++) {
                  const targetX = cx + dx;
                  const targetY = cy + dy;
                  const targetKey = `${targetX},${targetY}`;

                  if (!visitedRef.current[targetKey]) {
                       const type = getCellType(targetX, targetY);
                       if (type === 'COIN') {
                           const cellCenterX = (targetX * CELL_SIZE) + (CELL_SIZE / 2);
                           const cellCenterY = (targetY * CELL_SIZE) + (CELL_SIZE / 2);
                           
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

          const MAX_RANGE = 100; 
          
          if (minDistanceMeters <= MAX_RANGE) {
              playBeep();
              const t = minDistanceMeters / MAX_RANGE; 
              const interval = 100 + (Math.pow(t, 2) * 1900);
              timeoutId = setTimeout(pingLoop, interval);
          } else {
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
      if (audioCtxRef.current?.state === 'suspended') {
          audioCtxRef.current.resume();
      }
      
      if (manualMode) {
          setGps({ lat: 51.505, lon: -0.09 }); 
          setView('SCANNER');
          addLog("DEV: Manual Mode Active.");
      } else {
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
    if (isSupermarket && isVisited) { setView('SUPERMARKET'); return; }
    if (isToolShop && isVisited) { setView('TOOL_SHOP'); return; }
    if (isVisited) return; 

    if (cellType === 'EMPTY') {
        addLog(`Area Empty. +${XP_VALUES.SCAN_EMPTY} XP.`);
        setVisited(p => ({...p, [currentKey]: 'EMPTY'}));
        setXp(p => p + XP_VALUES.SCAN_EMPTY);
        setXpDelta(XP_VALUES.SCAN_EMPTY);
    } else if (cellType === 'COIN') {
        const newArtifact = generateArtifact(cell.x, cell.y);
        setLastDiscoveredArtifact(newArtifact);
        setInventory(prev => [newArtifact, ...prev]);
        setView('DISCOVERY');
        addLog(`Excavation Successful. +${XP_VALUES.SCAN_ITEM} XP.`);
        setVisited(p => ({...p, [currentKey]: 'COIN'}));
        setXp(p => p + XP_VALUES.SCAN_ITEM);
        setXpDelta(XP_VALUES.SCAN_ITEM);
    }
  };

  const handleRevive = (itemsToSell: Artifact[]) => {
      handleSell(itemsToSell);
      setBalance(prev => prev - 1000);
      setHp(50);
      setImmunityExpiry(Date.now() + 60000); 
      setView('SCANNER');
      addLog("Medical Bill Paid. Immunity Active (60s).");
  };

  const handleDirectPayRevive = () => {
      if (balance >= 1000) {
          setBalance(prev => prev - 1000);
          setHp(50);
          setImmunityExpiry(Date.now() + 60000); 
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
  
  // --- INVENTORY ACTIONS ---
  
  const handleUseItem = (item: Artifact) => {
      // Remove from inventory
      setInventory(prev => prev.filter(i => i.id !== item.id));
      
      const data = item.data as ItemData;
      
      if (data.effectType === 'HEAL') {
          setHp(h => Math.min(100, h + data.effectValue));
          addLog(`${data.name} Consumed. +${data.effectValue} HP.`);
          playPositiveChime();
      } 
      else if (data.effectType === 'RANGE_BOOST') {
          setDetectorExpiry(Date.now() + data.effectValue);
          addLog(`${data.name} Active. Range boosted.`);
      }
      else if (data.effectType === 'SONAR_BOOST') {
          setSonarExpiry(Date.now() + data.effectValue);
          addLog(`${data.name} Active. Sonar active.`);
      }
      else if (data.effectType === 'IMMUNITY') {
          setImmunityExpiry(Date.now() + data.effectValue);
          addLog(`${data.name} Active. Environmental shielding up.`);
      }
  };
  
  const handleBuyItem = (defId: string, catalog: any[]) => {
      const def = catalog.find(i => i.id === defId);
      if (!def) return;
      if (balance < def.cost) {
          addLog("Insufficient Funds.");
          return;
      }
      
      setBalance(b => b - def.cost);
      
      // Generate the item artifact
      const artifact = generateShopArtifact(def);
      
      // Set spoilage if it's food
      if (def.shelfLifeMs) {
          (artifact.data as ItemData).spoilageTimestamp = Date.now() + def.shelfLifeMs;
      }
      
      setInventory(prev => [artifact, ...prev]);
      addLog(`${def.name} Purchased.`);
  };

  const handleBuyBoutiqueItem = (item: Artifact) => {
      // Stub for future functionality
      if (balance < item.monetaryValue) {
          addLog("Insufficient Funds.");
          return;
      }
      setBalance(b => b - item.monetaryValue);
      setInventory(prev => [item, ...prev]);
      setBoutiqueItems(prev => prev.filter(i => i.id !== item.id));
      addLog(`${(item.data as any).name || item.type} Purchased from Boutique.`);
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
                    {/* Visual Feedback Delta */}
                    <span className={`transition-opacity duration-300 ${hpDelta ? 'opacity-100' : 'opacity-0'}`}>
                        {hpDelta ? `+${hpDelta}` : ''}
                    </span>
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
                    <span className={`transition-opacity duration-300 ${xpDelta ? 'opacity-100' : 'opacity-0'}`}>
                        {xpDelta ? `+${xpDelta}` : ''}
                    </span>
                </div>
            </div>

            {/* RIGHT COLUMN: Info (Balance & Timer) */}
            <div className="flex flex-col items-end gap-2">
                <div className="flex items-center gap-2">
                    <span className="text-white font-bold text-xs">${balance.toLocaleString()}</span>
                </div>

                 {isImmune && (
                    <div className="flex items-center gap-2 text-[10px] text-blue-400 bg-blue-900/20 px-2 py-1 rounded border border-blue-900/50 animate-pulse">
                        <ShieldAlert size={10} />
                        <span>IMMUNITY ACTIVE</span>
                    </div>
                 )}
            </div>
      </div>

      {/* 2. MAIN VIEW: SCANNER */}
      <div className={`absolute inset-0 flex flex-col transition-opacity duration-500 ${view === 'SCANNER' ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
            
            {/* Background Hostile Effect */}
            {isHostile && !isImmune && <div className="absolute inset-0 bg-red-900/20 animate-pulse pointer-events-none z-10"></div>}
            {isHostile && isImmune && <div className="absolute inset-0 bg-blue-900/10 pointer-events-none z-10"></div>}
            
            {/* Food Flash Effect */}
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
                    disabled={hp <= 0 || (isVisited && !isSupermarket && !isToolShop) || isAnalyzing}
                    className={`flex-1 font-bold h-14 rounded-lg tracking-widest active:scale-95 transition-all text-sm uppercase shadow-[0_0_15px_rgba(255,255,255,0.2)] disabled:shadow-none ${
                        (isSupermarket || isToolShop) && isVisited 
                        ? 'bg-blue-600 text-white hover:bg-blue-500' 
                        : 'bg-white text-black disabled:bg-zinc-800 disabled:text-zinc-500 hover:bg-zinc-200' 
                    }`}
                >
                    {hp <= 0 ? 'Exhausted' : (isSupermarket || isToolShop) && isVisited ? 'Enter Shop' : isVisited ? 'Area Cleared' : isAnalyzing ? 'Analyzing...' : 'Excavate'}
                </button>
            </div>
      </div>

      {/* 3. OVERLAYS */}
      {(view === 'INVENTORY' || view === 'EXHAUSTION') && (
            <InventoryView 
                items={inventory} 
                boutiqueItems={boutiqueItems}
                onClose={() => setView('SCANNER')} 
                mode={view === 'EXHAUSTION' ? 'REVIVE' : 'VIEW'}
                onRevive={handleRevive}
                onPayRevive={handleDirectPayRevive}
                onSell={handleSell}
                balance={balance}
                
                onUseItem={handleUseItem}
                onBuyBoutiqueItem={handleBuyBoutiqueItem}

                devInstantScan={devInstantScan}
                onToggleDevInstantScan={() => setDevInstantScan(!devInstantScan)}
                manualMode={manualMode}
                onToggleManualMovement={() => setManualMode(!manualMode)}
                
                onDevAddCash={() => { setBalance(b => b+10000); addLog("DEV: +$10k"); }}
                onOpenWorkbench={() => setView('WORKBENCH')}
            />
      )}

      {view === 'WORKBENCH' && <DesignWorkbench onClose={() => setView('INVENTORY')} />}

      {/* GENERIC SHOP VIEW (Handles both Supermarket and Tool Shop) */}
      {(view === 'SUPERMARKET' || view === 'TOOL_SHOP') && (
            <div className="absolute inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-6 animate-in fade-in zoom-in duration-300">
                    <div className="mb-6 flex items-center gap-4">
                        {view === 'SUPERMARKET' ? <ShoppingCart size={48} className="text-white" /> : <Wrench size={48} className="text-white" />}
                        <div>
                            <h2 className="text-2xl font-bold uppercase tracking-widest">{view === 'SUPERMARKET' ? 'Supermarket' : 'Tool Shop'}</h2>
                            <p className="text-zinc-500 text-xs">Level {currentLevel} Authorized</p>
                        </div>
                    </div>
                    
                    <div className="w-full space-y-4 mb-8 max-h-[60vh] overflow-y-auto">
                        {(view === 'SUPERMARKET' ? SUPERMARKET_CATALOG : TOOLSHOP_CATALOG).map(item => {
                            const isLocked = currentLevel < item.levelReq;
                            return (
                                <div key={item.id} className={`bg-zinc-900 border border-zinc-700 p-4 rounded-lg flex items-center justify-between ${isLocked ? 'opacity-50' : 'opacity-100'}`}>
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                            <div className="text-white text-sm font-bold">{item.name}</div>
                                            {isLocked && <span className="text-[10px] bg-red-900/50 text-red-400 px-1 rounded">LVL {item.levelReq}</span>}
                                        </div>
                                        <div className="text-zinc-500 text-[10px]">{item.description}</div>
                                        {item.shelfLifeMs && (
                                            <div className="text-zinc-600 text-[9px] mt-1">
                                                Shelf Life: {item.shelfLifeMs / (1000*60*60)} Hours
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex flex-col items-end gap-2 ml-4">
                                        <span className="text-white font-mono text-sm">${item.cost}</span>
                                        <button 
                                            onClick={() => handleBuyItem(item.id, view === 'SUPERMARKET' ? SUPERMARKET_CATALOG : TOOLSHOP_CATALOG)}
                                            disabled={isLocked || balance < item.cost}
                                            className="bg-white text-black hover:bg-zinc-200 disabled:bg-zinc-800 disabled:text-zinc-600 text-[10px] font-bold px-3 py-1 rounded uppercase tracking-wider"
                                        >
                                            {isLocked ? 'LOCKED' : 'BUY'}
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <button 
                    onClick={() => setView('SCANNER')}
                    className="text-zinc-500 text-xs hover:text-white mt-4 uppercase tracking-widest border border-zinc-800 px-6 py-3 rounded"
                    >
                        Leave Area
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
                        <p className="text-white text-xs uppercase flex items-center justify-center gap-2">
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