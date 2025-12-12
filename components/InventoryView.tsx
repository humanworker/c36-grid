
import React, { useMemo, useState, useEffect } from 'react';
import { Artifact, ArtifactType, CoinData, CoinSize, ItemData } from '../types';
import { ArtifactRenderer } from './ArtifactRenderer';
import { X, Check, Palette, Move, Activity, ScanLine, Radar, ChevronDown, ShoppingBag, Info, Circle, Cherry, Skull, ShoppingCart, Wrench } from 'lucide-react';

interface InventoryViewProps {
  items: Artifact[];
  boutiqueItems: Artifact[]; // New: Potential items to buy
  onClose: () => void;
  mode?: 'VIEW' | 'REVIVE' | 'SELL';
  onRevive?: (selectedArtifacts: Artifact[]) => void;
  onPayRevive?: () => void;
  onSell?: (selectedArtifacts: Artifact[]) => void;
  balance: number;
  
  // Usage Handlers
  onUseItem: (item: Artifact) => void;
  onBuyBoutiqueItem: (item: Artifact) => void;

  // Dev props
  devInstantScan?: boolean;
  onToggleDevInstantScan?: () => void;
  onDevAddCash?: () => void;
  
  isDetectorActive?: boolean;
  onToggleDetector?: () => void;
  
  isSonarActive?: boolean;
  onToggleSonar?: () => void;
  
  onOpenWorkbench?: () => void;
  
  // New: Manual Movement
  manualMode?: boolean;
  onToggleManualMovement?: () => void;
}

type SortOption = 'RECENT' | 'AGE' | 'RARITY' | 'STYLE'; 
type Tab = 'COLLECTION' | 'TOOLS' | 'PANTRY' | 'BOUTIQUE' | 'GUIDE';

// --- GUIDE CONFIGURATION ---
const ODDS_GUIDE = [
    { type: 'Empty Area', chance: '69%', icon: <X size={14}/>, color: 'text-zinc-500' },
    { type: 'Coin', chance: '10%', icon: <Circle size={14}/>, color: 'text-yellow-500' },
    { type: 'Fruit', chance: '10%', icon: <Cherry size={14}/>, color: 'text-green-500' },
    { type: 'Hostile', chance: '10%', icon: <Skull size={14}/>, color: 'text-red-500' },
    { type: 'Supermarket', chance: '0.5%', icon: <ShoppingCart size={14}/>, color: 'text-blue-400' },
    { type: 'Tool Shop', chance: '0.5%', icon: <Wrench size={14}/>, color: 'text-blue-400' },
];

const RARITY_GUIDE = [
    { metal: 'Platinum', chance: '1%', rarity: 'Ultra Rare' },
    { metal: 'Gold', chance: '2%', rarity: 'Very Rare' },
    { metal: 'Silver', chance: '5%', rarity: 'Rare' },
    { metal: 'Bronze', chance: '8%', rarity: 'Uncommon' },
    { metal: 'Aluminium', chance: '10%', rarity: 'Uncommon' },
    { metal: 'Brass', chance: '12%', rarity: 'Common' },
    { metal: 'Zinc', chance: '15%', rarity: 'Common' },
    { metal: 'Nickel', chance: '20%', rarity: 'Very Common' },
    { metal: 'Copper', chance: '27%', rarity: 'Abundant' },
];


export const InventoryView: React.FC<InventoryViewProps> = ({ 
  items, boutiqueItems, onClose, mode = 'VIEW', onRevive, onPayRevive, onSell, balance,
  onUseItem, onBuyBoutiqueItem,
  devInstantScan, onToggleDevInstantScan, onDevAddCash, 
  isDetectorActive, onToggleDetector,
  isSonarActive, onToggleSonar,
  onOpenWorkbench,
  manualMode, onToggleManualMovement
}) => {
  const [currentTab, setCurrentTab] = useState<Tab>('COLLECTION');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  
  const [sort, setSort] = useState<SortOption>('RECENT');
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [internalMode, setInternalMode] = useState<'VIEW' | 'SELL'>('VIEW');
  const [showDev, setShowDev] = useState(false);
  
  // State for single item selection in Use mode
  const [activeItemIndex, setActiveItemIndex] = useState<number | null>(null);

  // Determine actual effective mode
  const currentMode = mode === 'VIEW' ? internalMode : mode;

  // --- FILTER ITEMS BASED ON TAB ---
  const displayedItems = useMemo(() => {
      if (currentTab === 'BOUTIQUE') return boutiqueItems;
      if (currentTab === 'GUIDE') return [];
      
      return items.filter(item => {
          if (currentTab === 'COLLECTION') return item.type === ArtifactType.COIN;
          if (currentTab === 'TOOLS') return item.type === ArtifactType.TOOL;
          if (currentTab === 'PANTRY') return item.type === ArtifactType.FOOD;
          return false;
      });
  }, [items, boutiqueItems, currentTab]);

  // Stats - Calculated from Collection only
  const collectionItems = items.filter(i => i.type === ArtifactType.COIN);
  const totalValue = collectionItems.reduce((acc, curr) => acc + curr.monetaryValue, 0);
  const bestFind = collectionItems.reduce((max, curr) => Math.max(max, curr.monetaryValue), 0);

  // Sorting Logic
  const sortedItems = useMemo(() => {
    const list = displayedItems.map((item, index) => ({ item, originalIndex: index }));
    
    switch (sort) {
      case 'RECENT': 
        return list.sort((a, b) => b.item.foundDate - a.item.foundDate); // Recent first
      case 'AGE':
        return list.sort((a, b) => {
            const yearA = (a.item.data as CoinData).year || 2025;
            const yearB = (b.item.data as CoinData).year || 2025;
            return yearA - yearB;
        });
      case 'RARITY':
        return list.sort((a, b) => b.item.rarityScore - a.item.rarityScore);
      case 'STYLE':
        return list.sort((a, b) => {
            const styleA = (a.item.data as CoinData).pattern || (a.item.data as ItemData).name || '';
            const styleB = (b.item.data as CoinData).pattern || (b.item.data as ItemData).name || '';
            return styleA.localeCompare(styleB);
        });
      default:
        return list;
    }
  }, [displayedItems, sort]);

  // Selection Logic (Multi-select for Sell/Revive, Single select for Use)
  const handleItemClick = (index: number) => {
    // If selling or reviving, use multi-select
    if (currentMode === 'SELL' || currentMode === 'REVIVE') {
        const newSet = new Set(selectedIndices);
        if (newSet.has(index)) {
            newSet.delete(index);
        } else {
            newSet.add(index);
        }
        setSelectedIndices(newSet);
    } 
    // If viewing (Collection/Tools/Pantry), use single select for details/usage
    else {
        setActiveItemIndex(index === activeItemIndex ? null : index);
    }
  };

  // Selection Stats
  const selectedValue = Array.from(selectedIndices).reduce<number>((acc, idx) => {
      // Find item in main list based on index provided by sorted list logic? 
      // Simplified: We assume indexes passed here map to displayedItems
      const item = displayedItems[idx];
      return acc + (item ? item.monetaryValue : 0);
  }, 0);

  // Mode Specific Logic
  const isRevive = currentMode === 'REVIVE';
  const isSell = currentMode === 'SELL';
  const REVIVE_COST = 1000;
  
  const canAffordCash = balance >= REVIVE_COST;
  const isBankrupt = !canAffordCash && (balance + totalValue < REVIVE_COST);
  const reviveTarget = canAffordCash ? 0 : REVIVE_COST - balance; 
  
  const canRevive = isRevive && (canAffordCash || (selectedValue >= reviveTarget || (isBankrupt && Math.abs(selectedValue - totalValue) < 1)));
  const canSell = isSell && selectedIndices.size > 0;

  const handleAction = () => {
      if (isRevive) {
          if (canAffordCash && onPayRevive) {
              onPayRevive();
          } else if (onRevive) {
              const selection = displayedItems.filter((_, idx) => selectedIndices.has(idx));
              onRevive(selection);
          }
      }
      if (isSell && onSell) {
          const selection = displayedItems.filter((_, idx) => selectedIndices.has(idx));
          onSell(selection);
          setSelectedIndices(new Set());
          setInternalMode('VIEW');
      }
  };

  // Helper to determine size class for rendering
  const getSizeClass = (artifact: Artifact) => {
      if (artifact.type === ArtifactType.COIN) {
          const size = (artifact.data as CoinData).size;
          switch(size) {
              case CoinSize.Large: return 'w-[80%]';
              case CoinSize.Medium: return 'w-[65%]';
              case CoinSize.Small: return 'w-[50%]';
              case CoinSize.Tiny: return 'w-[40%]';
          }
      }
      return 'w-[60%]'; 
  };

  // Helper to extract display details safely
  const getArtifactDetails = (artifact: Artifact) => {
      if (artifact.type === ArtifactType.COIN) {
          const d = artifact.data as CoinData;
          return {
              title: d.metal,
              subtitle: `${d.year > 0 ? `${d.year} AD` : `${Math.abs(d.year)} BC`} • ${d.condition}`
          };
      }
      const d = artifact.data as ItemData;
      return { title: d.name, subtitle: d.description };
  };

  // Spoilage Formatter
  const getSpoilageTime = (item: Artifact) => {
      const data = item.data as ItemData;
      // Gameplay time priority
      if (data.remainingLifeMs !== undefined) {
          const msLeft = data.remainingLifeMs;
          if (msLeft <= 0) return "Spoiled";
          const hours = Math.floor(msLeft / (1000 * 60 * 60));
          if (hours >= 24) return `${Math.floor(hours / 24)} Days`;
          if (hours >= 1) return `${hours} Hours`;
          return `${Math.floor(msLeft / (1000 * 60))} Mins`;
      }
      // Legacy Fallback
      if (data.spoilageTimestamp) {
          const msLeft = data.spoilageTimestamp - Date.now();
          if (msLeft <= 0) return "Spoiled";
          const hours = Math.floor(msLeft / (1000 * 60 * 60));
          if (hours > 24) return `${Math.floor(hours / 24)} Days`;
          if (hours > 0) return `${hours} Hours`;
          return `${Math.floor(msLeft / (1000 * 60))} Mins`;
      }
      return null;
  };

  return (
    <div className="absolute inset-0 z-50 bg-black flex flex-col animate-in slide-in-from-bottom duration-300">
      
      {/* Dev Panel Overlay */}
      {showDev && (
          <div className="absolute top-16 left-4 right-4 bg-zinc-900 border border-zinc-700 p-4 rounded shadow-2xl z-50 flex flex-col gap-4 animate-in fade-in zoom-in duration-200">
              <div className="flex justify-between items-center border-b border-zinc-700 pb-2">
                  <h3 className="text-white font-bold text-xs uppercase tracking-widest">Developer Tools</h3>
                  <button onClick={() => setShowDev(false)} className="text-zinc-500 hover:text-white"><X size={16}/></button>
              </div>
              
              {/* Toggles */}
              <div className="flex items-center justify-between">
                  <span className="text-zinc-400 text-xs">Disable Wait Timer</span>
                  <button onClick={onToggleDevInstantScan} className={`w-10 h-5 rounded-full relative transition-colors ${devInstantScan ? 'bg-green-500' : 'bg-zinc-700'}`}>
                      <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${devInstantScan ? 'left-6' : 'left-1'}`}></div>
                  </button>
              </div>

              <div className="flex items-center justify-between">
                  <span className="text-zinc-400 text-xs flex items-center gap-2"><Move size={12}/> Manual Movement</span>
                  <button onClick={onToggleManualMovement} className={`w-10 h-5 rounded-full relative transition-colors ${manualMode ? 'bg-blue-500' : 'bg-zinc-700'}`}>
                      <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${manualMode ? 'left-6' : 'left-1'}`}></div>
                  </button>
              </div>

              <button onClick={onDevAddCash} className="w-full bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold py-3 rounded uppercase border border-zinc-600">
                  Add $10,000 Cash
              </button>
              
              <div className="border-t border-zinc-700 pt-4">
                  <button onClick={onOpenWorkbench} className="w-full bg-blue-900/50 hover:bg-blue-900 text-blue-200 text-xs font-bold py-3 rounded uppercase border border-blue-800 flex items-center justify-center gap-2">
                      <Palette size={16} /> Open Design Workbench
                  </button>
              </div>
          </div>
      )}

      {/* Header */}
      <div className="bg-black border-b border-zinc-900 p-4 space-y-4 relative z-40">
        <div className="flex justify-between items-center">
            
            {/* DROPDOWN TITLE */}
            <div className="relative">
                <button 
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    className={`font-bold tracking-widest text-sm uppercase flex items-center gap-2 ${isRevive ? 'text-red-500' : 'text-white'} hover:opacity-80`}
                >
                    {isRevive ? 'Medical Bill' : currentTab}
                    <ChevronDown size={14} className={`transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {isDropdownOpen && !isRevive && (
                    <div className="absolute top-full left-0 mt-2 w-48 bg-zinc-900 border border-zinc-800 rounded shadow-xl overflow-hidden flex flex-col">
                        {(['COLLECTION', 'TOOLS', 'PANTRY', 'BOUTIQUE', 'GUIDE'] as Tab[]).map(tab => (
                            <button
                                key={tab}
                                onClick={() => { setCurrentTab(tab); setIsDropdownOpen(false); setActiveItemIndex(null); }}
                                className={`text-left px-4 py-3 text-xs font-bold tracking-wider hover:bg-zinc-800 ${currentTab === tab ? 'text-white bg-zinc-800' : 'text-zinc-500'}`}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>
                )}
            </div>
            
            <div className="flex gap-4">
                {mode === 'VIEW' && currentMode === 'VIEW' && (
                    <>
                        <button onClick={() => setShowDev(!showDev)} className="text-zinc-500 hover:text-white transition-colors text-xs font-bold border border-zinc-800 hover:border-zinc-600 px-2 py-1 rounded">
                            DEV
                        </button>
                        {/* Only allow Manage Assets (Sell) on Collection */}
                        {currentTab === 'COLLECTION' && (
                             <button onClick={() => setInternalMode('SELL')} className="text-zinc-400 hover:text-white transition-colors text-xs font-bold border border-zinc-800 px-2 py-1 rounded">
                                MANAGE ASSETS
                            </button>
                        )}
                    </>
                )}
                {mode === 'VIEW' && currentMode === 'SELL' && (
                    <button onClick={() => { setInternalMode('VIEW'); setSelectedIndices(new Set()); }} className="text-zinc-400 hover:text-white transition-colors text-xs font-bold border border-zinc-800 px-2 py-1 rounded">
                        CANCEL
                    </button>
                )}
                {mode === 'VIEW' && (
                    <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                )}
            </div>
        </div>
        
        {isRevive && !canAffordCash && (
             <div className="text-xs text-zinc-400 font-mono mb-2">
                Operator Exhausted. Sell <span className="text-white">${reviveTarget.toLocaleString()}</span> to pay medical bill.
            </div>
        )}

        {/* Stats Bar (Hidden in Revive Mode if we are paying cash or in Guide) */}
        {!(isRevive && canAffordCash) && currentTab === 'COLLECTION' && (
            <div className="grid grid-cols-3 gap-2">
                <div className="bg-zinc-900/50 p-2 rounded border border-zinc-800 flex flex-col items-center">
                    <span className="text-[10px] text-zinc-500 uppercase flex items-center gap-1">Count</span>
                    <span className="text-white font-mono text-sm">{collectionItems.length}</span>
                </div>
                <div className="bg-zinc-900/50 p-2 rounded border border-zinc-800 flex flex-col items-center">
                    <span className="text-[10px] text-zinc-500 uppercase flex items-center gap-1">Value</span>
                    <span className="text-white font-mono text-sm">${totalValue.toLocaleString()}</span>
                </div>
                <div className="bg-zinc-900/50 p-2 rounded border border-zinc-800 flex flex-col items-center">
                    <span className="text-[10px] text-zinc-500 uppercase flex items-center gap-1">Best</span>
                    <span className="text-white font-mono text-sm">${bestFind.toLocaleString()}</span>
                </div>
            </div>
        )}

        {/* Sort Tabs - Only for Collection */}
        {!(isRevive && canAffordCash) && currentTab === 'COLLECTION' && (
            <div className="flex gap-2 text-[10px] overflow-x-auto no-scrollbar">
                {(['RECENT', 'AGE', 'RARITY', 'STYLE'] as SortOption[]).map((opt) => (
                    <button 
                        key={opt}
                        onClick={() => setSort(opt)}
                        className={`px-3 py-1 rounded border transition-colors whitespace-nowrap ${
                            sort === opt 
                            ? 'bg-zinc-100 text-black border-zinc-100 font-bold' 
                            : 'bg-transparent text-gray-500 border-zinc-800 hover:border-zinc-500'
                        }`}
                    >
                        {opt}
                    </button>
                ))}
            </div>
        )}
      </div>

      {/* Grid Content OR Pay Bill Overlay */}
      <div className="flex-1 overflow-y-auto p-4 bg-black pb-32 relative" onClick={() => setIsDropdownOpen(false)}>
        
        {/* Simple Pay Overlay */}
        {isRevive && canAffordCash ? (
             <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center space-y-8">
                 <div className="p-4 bg-red-900/20 rounded-full animate-pulse">
                    <Activity size={48} className="text-red-500" />
                 </div>
                 <div className="space-y-2">
                     <h3 className="text-xl font-bold text-white uppercase tracking-widest">Medical Assistance</h3>
                     <p className="text-zinc-500 text-xs max-w-xs mx-auto">
                         You have suffered from exhaustion. Immediate medical attention is required to restore systems.
                     </p>
                 </div>
                 <div className="text-2xl font-mono text-red-500 font-bold">
                     Cost: ${REVIVE_COST.toLocaleString()}
                 </div>
             </div>
        ) : currentTab === 'GUIDE' ? (
            // --- GUIDE VIEW ---
            <div className="space-y-8 animate-in fade-in duration-300">
                <div className="space-y-4">
                    <div className="flex items-center gap-2 text-white border-b border-zinc-800 pb-2">
                        <Radar size={16} className="text-blue-500" />
                        <h3 className="text-sm font-bold uppercase tracking-widest">Scanner Probabilities</h3>
                    </div>
                    <div className="grid gap-2">
                        {ODDS_GUIDE.map((item, i) => (
                            <div key={i} className="flex items-center justify-between bg-zinc-900/30 p-3 rounded border border-zinc-800">
                                <div className="flex items-center gap-3">
                                    <div className={item.color}>{item.icon}</div>
                                    <span className="text-zinc-300 text-xs font-mono">{item.type}</span>
                                </div>
                                <span className="text-white font-bold text-xs">{item.chance}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="flex items-center gap-2 text-white border-b border-zinc-800 pb-2">
                        <Circle size={16} className="text-yellow-500" />
                        <h3 className="text-sm font-bold uppercase tracking-widest">Coin Rarity</h3>
                    </div>
                     <div className="grid gap-2">
                        {RARITY_GUIDE.map((item, i) => (
                            <div key={i} className="flex items-center justify-between bg-zinc-900/30 p-3 rounded border border-zinc-800">
                                <div className="flex flex-col">
                                    <span className="text-zinc-300 text-xs font-bold">{item.metal}</span>
                                    <span className="text-zinc-600 text-[10px] uppercase tracking-wide">{item.rarity}</span>
                                </div>
                                <span className="text-white font-mono text-xs">{item.chance}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        ) : (
            // Standard Grid
            sortedItems.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-zinc-700 space-y-2 opacity-50">
                <div className="text-xs font-mono tracking-widest uppercase">
                    {currentTab === 'BOUTIQUE' ? 'No Items Unlocked' : 'Empty'}
                </div>
            </div>
            ) : (
            <div className="grid grid-cols-3 gap-3">
                {sortedItems.map(({ item, originalIndex }, idx) => {
                const isSelected = selectedIndices.has(originalIndex);
                const isActive = activeItemIndex === originalIndex;
                const details = getArtifactDetails(item);
                const spoilage = item.type === ArtifactType.FOOD ? getSpoilageTime(item) : null;
                const isBoutique = currentTab === 'BOUTIQUE';
                
                return (
                    <button 
                        key={item.id} 
                        onClick={() => handleItemClick(originalIndex)}
                        // Disable clicking for Sell/Revive if not in collection (though they are filtered out anyway)
                        disabled={currentMode === 'VIEW' ? false : currentTab !== 'COLLECTION'}
                        className={`flex flex-col gap-2 group relative text-left ${currentMode === 'VIEW' ? 'cursor-pointer' : 'cursor-pointer'}`}
                    >
                        {/* Thumbnail */}
                        <div className={`aspect-square bg-zinc-900 rounded-lg border relative overflow-hidden flex items-center justify-center transition-all ${
                            (isSelected || isActive)
                                ? 'border-white border-4 bg-zinc-800' 
                                : 'border-zinc-800 group-hover:border-zinc-600'
                        }`}>
                            {/* Selection Overlay */}
                            {isSelected && (
                                <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/10">
                                    <div className="bg-black rounded-full p-1">
                                        <Check size={20} className="text-white" strokeWidth={4} />
                                    </div>
                                </div>
                            )}

                            {/* Artifact Render */}
                            <div className={`aspect-square flex items-center justify-center pointer-events-none transition-opacity ${isSelected ? 'opacity-60' : 'opacity-100'} ${getSizeClass(item)}`}>
                                <ArtifactRenderer artifact={item} className="w-full h-full" />
                            </div>

                            {/* Rarity/Cost Badge */}
                            {item.type === ArtifactType.COIN ? (
                                <div className="absolute top-1 right-1 px-1 bg-black/80 border border-zinc-800 rounded text-[9px] text-yellow-500 font-mono backdrop-blur-sm">
                                    {item.rarityScore.toFixed(1)}
                                </div>
                            ) : isBoutique ? (
                                <div className="absolute top-1 right-1 px-1 bg-black/80 border border-zinc-800 rounded text-[9px] text-green-400 font-mono backdrop-blur-sm">
                                    ${item.monetaryValue}
                                </div>
                            ) : null}
                            
                            {/* Spoilage Warning */}
                            {spoilage && (
                                <div className="absolute bottom-1 left-1 right-1 bg-red-900/80 text-[8px] text-white text-center rounded px-1">
                                    {spoilage}
                                </div>
                            )}
                        </div>
                        {/* Details */}
                        <div className="px-1">
                            <div className="flex justify-between items-baseline">
                                <span className="text-[10px] text-white font-bold truncate">{details.title}</span>
                                {item.type === ArtifactType.COIN && <span className="text-[10px] text-white font-mono">${item.monetaryValue.toLocaleString()}</span>}
                            </div>
                            <div className="text-[8px] text-zinc-500 truncate">
                                {details.subtitle}
                            </div>
                        </div>
                    </button>
                );
                })}
            </div>
            )
        )}
      </div>

      {/* Footer Action */}
      {(isRevive || isSell) && (
          <div className="absolute bottom-0 left-0 w-full bg-zinc-900 border-t border-zinc-800 p-4 pb-8 shadow-xl z-50">
              {!(isRevive && canAffordCash) && (
                  <div className="flex justify-between text-xs font-mono mb-2">
                    <span className="text-zinc-400">Selected:</span>
                    <div className="flex gap-2">
                        <span className={selectedValue >= (isRevive ? reviveTarget : 0) ? "text-green-400" : "text-white"}>
                            ${selectedValue.toLocaleString()} 
                        </span>
                        {isRevive && <span className="text-zinc-500">/ ${reviveTarget.toLocaleString()}</span>}
                    </div>
                </div>
              )}
              
              <button
                onClick={handleAction}
                disabled={isRevive ? !canRevive : !canSell}
                className={`w-full h-12 rounded font-bold tracking-widest uppercase transition-all ${
                    (isRevive ? canRevive : canSell)
                    ? 'bg-white text-black hover:bg-zinc-200' 
                    : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                }`}
              >
                  {isRevive ? (canAffordCash ? 'PAY BILL ($1,000)' : isBankrupt && !canRevive ? 'Select All' : 'Liquidate & Pay') : 'Confirm Sale'}
              </button>
          </div>
      )}

      {/* Use / Buy Footer */}
      {!isRevive && !isSell && activeItemIndex !== null && (
         <div className="absolute bottom-0 left-0 w-full bg-zinc-900 border-t border-zinc-800 p-4 pb-8 shadow-xl z-50 animate-in slide-in-from-bottom duration-200">
             {(() => {
                 const item = displayedItems[activeItemIndex];
                 if (!item) return null;
                 const isFood = item.type === ArtifactType.FOOD;
                 const isTool = item.type === ArtifactType.TOOL;
                 const isBoutique = currentTab === 'BOUTIQUE';

                 if (isBoutique) {
                     return (
                        <button
                            onClick={() => { onBuyBoutiqueItem(item); setActiveItemIndex(null); }}
                            disabled={balance < item.monetaryValue}
                            className={`w-full h-12 rounded font-bold tracking-widest uppercase transition-all flex items-center justify-center gap-2 ${
                                balance >= item.monetaryValue ? 'bg-white text-black hover:bg-zinc-200' : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                            }`}
                        >
                            <ShoppingBag size={16} /> BUY (${item.monetaryValue})
                        </button>
                     )
                 }

                 if (isFood || isTool) {
                     return (
                        <button
                            onClick={() => { onUseItem(item); setActiveItemIndex(null); }}
                            className="w-full h-12 rounded font-bold tracking-widest uppercase transition-all bg-white text-black hover:bg-zinc-200 flex items-center justify-center gap-2"
                        >
                            {isFood ? 'Eat' : 'Use'}
                        </button>
                     )
                 }

                 return null;
             })()}
         </div>
      )}

    </div>
  );
};
