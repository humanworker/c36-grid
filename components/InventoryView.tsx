import React, { useMemo, useState } from 'react';
import { Artifact, ArtifactType, CoinData, CoinSize } from '../types';
import { ArtifactRenderer } from './ArtifactRenderer';
import { X, Check, Palette, Move } from 'lucide-react';

interface InventoryViewProps {
  items: Artifact[];
  onClose: () => void;
  mode?: 'VIEW' | 'REVIVE' | 'SELL';
  onRevive?: (selectedArtifacts: Artifact[]) => void;
  onSell?: (selectedArtifacts: Artifact[]) => void;
  // Dev props
  devInstantScan?: boolean;
  onToggleDevInstantScan?: () => void;
  onDevAddCash?: () => void;
  onDevEnableDetector?: () => void;
  onOpenWorkbench?: () => void;
  
  // New: Manual Movement
  manualMode?: boolean;
  onToggleManualMovement?: () => void;
}

type SortOption = 'RECENT' | 'AGE' | 'RARITY' | 'STYLE'; 

export const InventoryView: React.FC<InventoryViewProps> = ({ 
  items, onClose, mode = 'VIEW', onRevive, onSell,
  devInstantScan, onToggleDevInstantScan, onDevAddCash, onDevEnableDetector, onOpenWorkbench,
  manualMode, onToggleManualMovement
}) => {
  const [sort, setSort] = useState<SortOption>('RECENT');
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [internalMode, setInternalMode] = useState<'VIEW' | 'SELL'>('VIEW');
  const [showDev, setShowDev] = useState(false);

  // Determine actual effective mode
  const currentMode = mode === 'VIEW' ? internalMode : mode;

  // Stats - Calculated from generic properties
  const totalValue = items.reduce((acc, curr) => acc + curr.monetaryValue, 0);
  const bestFind = items.reduce((max, curr) => Math.max(max, curr.monetaryValue), 0);

  // Sorting Logic
  const sortedItems = useMemo(() => {
    const list = items.map((item, index) => ({ item, originalIndex: index }));
    
    switch (sort) {
      case 'RECENT': 
        return list.sort((a, b) => b.item.foundDate - a.item.foundDate); // Recent first
      case 'AGE':
        // For coins, we use 'year'. 
        return list.sort((a, b) => {
            const yearA = (a.item.data as CoinData).year || 2025;
            const yearB = (b.item.data as CoinData).year || 2025;
            return yearA - yearB;
        });
      case 'RARITY':
        return list.sort((a, b) => b.item.rarityScore - a.item.rarityScore);
      case 'STYLE':
         // Sort by Pattern name (alphabetical)
        return list.sort((a, b) => {
            const styleA = (a.item.data as CoinData).pattern || '';
            const styleB = (b.item.data as CoinData).pattern || '';
            return styleA.localeCompare(styleB);
        });
      default:
        return list;
    }
  }, [items, sort]);

  // Selection Logic
  const toggleSelection = (index: number) => {
    if (currentMode === 'VIEW') return;
    const newSet = new Set(selectedIndices);
    if (newSet.has(index)) {
        newSet.delete(index);
    } else {
        newSet.add(index);
    }
    setSelectedIndices(newSet);
  };

  // Selection Stats
  const selectedValue = Array.from(selectedIndices).reduce<number>((acc, idx) => {
      const item = items[idx as number];
      return acc + (item ? item.monetaryValue : 0);
  }, 0);

  // Mode Specific Logic
  const isRevive = currentMode === 'REVIVE';
  const isSell = currentMode === 'SELL';
  const REVIVE_COST = 1000;
  const isBankrupt = totalValue < REVIVE_COST;
  const reviveTarget = isBankrupt ? totalValue : REVIVE_COST;
  
  const canRevive = isRevive && (selectedValue >= reviveTarget || (isBankrupt && Math.abs(selectedValue - totalValue) < 1));
  const canSell = isSell && selectedIndices.size > 0;

  const handleAction = () => {
      const selection = items.filter((_, idx) => selectedIndices.has(idx));
      if (isRevive && onRevive) onRevive(selection);
      if (isSell && onSell) {
          onSell(selection);
          setSelectedIndices(new Set());
          setInternalMode('VIEW');
      }
  };

  // Helper to determine size class for rendering (keeps the grid looking organic)
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
      return 'w-[60%]'; // Default for future types
  };

  // Helper to extract display details safely
  const getArtifactDetails = (artifact: Artifact) => {
      if (artifact.type === ArtifactType.COIN) {
          const d = artifact.data as CoinData;
          return {
              title: d.metal,
              subtitle: `${d.year > 0 ? `${d.year} AD` : `${Math.abs(d.year)} BC`} • ${d.pattern}`
          };
      }
      return { title: 'Unknown', subtitle: '???' };
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
                  <button 
                    onClick={onToggleDevInstantScan}
                    className={`w-10 h-5 rounded-full relative transition-colors ${devInstantScan ? 'bg-green-500' : 'bg-zinc-700'}`}
                  >
                      <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${devInstantScan ? 'left-6' : 'left-1'}`}></div>
                  </button>
              </div>

              {/* Manual Movement Toggle */}
              <div className="flex items-center justify-between">
                  <span className="text-zinc-400 text-xs flex items-center gap-2"><Move size={12}/> Manual Movement (Keys)</span>
                  <button 
                    onClick={onToggleManualMovement}
                    className={`w-10 h-5 rounded-full relative transition-colors ${manualMode ? 'bg-blue-500' : 'bg-zinc-700'}`}
                  >
                      <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${manualMode ? 'left-6' : 'left-1'}`}></div>
                  </button>
              </div>

              {/* Actions */}
              <button onClick={onDevEnableDetector} className="w-full bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold py-3 rounded uppercase border border-zinc-600">
                  Enable Metal Detector
              </button>
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
      <div className="bg-black border-b border-zinc-900 p-4 space-y-4">
        <div className="flex justify-between items-center">
            <h2 className={`font-bold tracking-widest text-sm uppercase flex items-center gap-2 ${isRevive ? 'text-red-500' : 'text-white'}`}>
                {isRevive ? 'Medical Bill' : 'Collection'}
            </h2>
            <div className="flex gap-4">
                {mode === 'VIEW' && currentMode === 'VIEW' && (
                    <>
                        <button onClick={() => setShowDev(!showDev)} className="text-zinc-500 hover:text-white transition-colors text-xs font-bold border border-zinc-800 hover:border-zinc-600 px-2 py-1 rounded">
                            DEV
                        </button>
                        <button onClick={() => setInternalMode('SELL')} className="text-zinc-400 hover:text-white transition-colors text-xs font-bold border border-zinc-800 px-2 py-1 rounded">
                            MANAGE ASSETS
                        </button>
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
        
        {isRevive && (
             <div className="text-xs text-zinc-400 font-mono mb-2">
                Operator Exhausted. Sell <span className="text-white">${reviveTarget.toLocaleString()}</span> to restore systems.
                {isBankrupt && <div className="text-red-500 mt-1">INSUFFICIENT FUNDS: TOTAL LIQUIDATION REQUIRED.</div>}
            </div>
        )}

        {/* Stats Bar */}
        <div className="grid grid-cols-3 gap-2">
            <div className="bg-zinc-900/50 p-2 rounded border border-zinc-800 flex flex-col items-center">
                <span className="text-[10px] text-zinc-500 uppercase flex items-center gap-1">Count</span>
                <span className="text-white font-mono text-sm">{items.length}</span>
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

        {/* Sort Tabs */}
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
      </div>

      {/* Grid Content */}
      <div className="flex-1 overflow-y-auto p-4 bg-black pb-32">
        {sortedItems.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-zinc-700 space-y-2 opacity-50">
            <div className="text-xs font-mono tracking-widest">NO DATA</div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {sortedItems.map(({ item, originalIndex }, idx) => {
              const isSelected = selectedIndices.has(originalIndex);
              const details = getArtifactDetails(item);
              
              return (
                <button 
                    key={item.id} // Use stable ID
                    onClick={() => toggleSelection(originalIndex)}
                    disabled={currentMode === 'VIEW'}
                    className={`flex flex-col gap-2 group relative text-left ${currentMode === 'VIEW' ? 'cursor-default' : 'cursor-pointer'}`}
                >
                    {/* Thumbnail */}
                    <div className={`aspect-square bg-zinc-900 rounded-lg border relative overflow-hidden flex items-center justify-center transition-all ${
                        isSelected 
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

                         {/* Artifact Render using Switchboard */}
                         <div className={`aspect-square flex items-center justify-center pointer-events-none transition-opacity ${isSelected ? 'opacity-60' : 'opacity-100'} ${getSizeClass(item)}`}>
                            <ArtifactRenderer artifact={item} className="w-full h-full" />
                        </div>

                        {/* Rarity Badge */}
                        <div className="absolute top-1 right-1 px-1 bg-black/80 border border-zinc-800 rounded text-[9px] text-yellow-500 font-mono backdrop-blur-sm">
                            {item.rarityScore.toFixed(1)}
                        </div>
                    </div>
                    {/* Details */}
                    <div className="px-1">
                        <div className="flex justify-between items-baseline">
                            <span className="text-[10px] text-white font-bold truncate">{details.title}</span>
                            <span className="text-[10px] text-white font-mono">${item.monetaryValue.toLocaleString()}</span>
                        </div>
                        <div className="text-[8px] text-zinc-600 truncate">
                            {details.subtitle}
                        </div>
                    </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer Action */}
      {(isRevive || isSell) && (
          <div className="absolute bottom-0 left-0 w-full bg-zinc-900 border-t border-zinc-800 p-4 pb-8 shadow-xl z-50">
              <div className="flex justify-between text-xs font-mono mb-2">
                  <span className="text-zinc-400">Selected:</span>
                  <div className="flex gap-2">
                    <span className={selectedValue >= (isRevive ? reviveTarget : 0) ? "text-green-400" : "text-white"}>
                        ${selectedValue.toLocaleString()} 
                    </span>
                    {isRevive && <span className="text-zinc-500">/ ${reviveTarget.toLocaleString()}</span>}
                  </div>
              </div>
              <button
                onClick={handleAction}
                disabled={isRevive ? !canRevive : !canSell}
                className={`w-full h-12 rounded font-bold tracking-widest uppercase transition-all ${
                    (isRevive ? canRevive : canSell)
                    ? 'bg-white text-black hover:bg-zinc-200' 
                    : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                }`}
              >
                  {isRevive ? (isBankrupt && !canRevive ? 'Select All' : 'Sell & Revive') : 'Confirm Sale'}
              </button>
          </div>
      )}
    </div>
  );
};