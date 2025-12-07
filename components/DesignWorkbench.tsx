import React, { useState } from 'react';
import { CoinData, CoinMetal, CoinCondition, CoinBorder, CoinSize, CoinPattern, ArtifactType } from '../types';
import { CoinRender } from './CoinRender';
import { Controls } from './Controls';
import { X } from 'lucide-react';

interface DesignWorkbenchProps {
  onClose: () => void;
}

export const DesignWorkbench: React.FC<DesignWorkbenchProps> = ({ onClose }) => {
  // Default Initial State for the Workbench
  const [data, setData] = useState<CoinData>({
    metal: CoinMetal.Gold,
    year: 1400, // Default to old to show off the irregular shape
    condition: CoinCondition.Poor, // Default to poor to show off scratches
    border: CoinBorder.Standard,
    size: CoinSize.Large,
    pattern: CoinPattern.Floral
  });

  const [artifactType, setArtifactType] = useState<ArtifactType>(ArtifactType.COIN);

  return (
    <div className="absolute inset-0 z-[60] bg-black flex flex-col font-mono animate-in fade-in duration-300">
      {/* Header */}
      <div className="bg-zinc-900 border-b border-zinc-800 p-4 flex justify-between items-center">
         <div className="flex items-center gap-4">
             <h2 className="text-white font-bold tracking-widest uppercase text-sm">Design Lab</h2>
             <select 
                value={artifactType}
                onChange={(e) => setArtifactType(e.target.value as ArtifactType)}
                className="bg-black text-xs text-zinc-400 border border-zinc-700 rounded px-2 py-1 outline-none focus:border-white"
             >
                 {Object.values(ArtifactType).map(t => <option key={t} value={t}>{t}</option>)}
             </select>
         </div>
         <button onClick={onClose} className="text-zinc-500 hover:text-white">
             <X size={20} />
         </button>
      </div>

      {/* Main Split View */}
      <div className="flex-1 flex flex-col">
          
          {/* Top: Preview Area */}
          <div className="flex-1 bg-dither flex items-center justify-center p-8 relative overflow-hidden">
              <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-zinc-800 to-black pointer-events-none"></div>
              
              {/* The Artifact */}
              <div className="w-64 h-64 relative drop-shadow-2xl transition-all duration-300 flex items-center justify-center">
                  {artifactType === ArtifactType.COIN ? (
                      <div className="w-full h-full">
                          <CoinRender data={data} />
                      </div>
                  ) : (
                      <div className="w-full h-full flex items-center justify-center border-2 border-dashed border-zinc-800 text-zinc-600 text-xs">
                          NO RENDERER
                      </div>
                  )}
              </div>

              {/* Specs Overlay */}
              <div className="absolute bottom-4 left-4 text-[10px] text-zinc-500 font-mono space-y-1">
                  <div>TYPE: {artifactType}</div>
                  {artifactType === ArtifactType.COIN && (
                      <>
                        <div>MTL: {data.metal.toUpperCase()}</div>
                        <div>PTN: {data.pattern.toUpperCase()}</div>
                        <div>YR: {data.year}</div>
                      </>
                  )}
              </div>
          </div>

          {/* Bottom: Controls */}
          <div className="h-1/2 bg-black border-t border-zinc-800 overflow-y-auto p-6">
              {artifactType === ArtifactType.COIN && (
                  <Controls data={data} onChange={setData} />
              )}
              {/* Future controls for other types would go here */}
          </div>
      </div>
    </div>
  );
};
