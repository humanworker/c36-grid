
import React from 'react';
import { Artifact, ArtifactType, CoinData, ItemData } from '../types';
import { CoinRender } from './CoinRender';
import { Wrench, Zap, Apple, Package } from 'lucide-react';

interface ArtifactRendererProps {
  artifact: Artifact;
  className?: string; // Allow passing classes for size/positioning
}

export const ArtifactRenderer: React.FC<ArtifactRendererProps> = ({ artifact, className }) => {
  switch (artifact.type) {
    case ArtifactType.COIN:
      // Cast the generic data to specific CoinData
      return (
        <div className={className}>
            <CoinRender data={artifact.data as CoinData} />
        </div>
      );

    case ArtifactType.TOOL: {
        const d = artifact.data as ItemData;
        return (
            <div className={`${className} bg-blue-900/20 flex flex-col items-center justify-center p-2 rounded border border-blue-900/50`}>
                <div className="bg-blue-500 p-3 rounded-full mb-1">
                    {d.name.includes('Sonar') ? <Zap size={24} className="text-white"/> : <Wrench size={24} className="text-white"/>}
                </div>
            </div>
        );
    }

    case ArtifactType.FOOD:
        const data = artifact.data as ItemData;
        return (
            <div className={`${className} bg-green-900/20 flex flex-col items-center justify-center p-2 rounded border border-green-900/50`}>
                <div className="bg-green-500 p-3 rounded-full mb-1">
                   {/* Differentiate map food (Apple), Sandwich, vs Pantry items (Package/Can) */}
                   {data.name === 'Fruit' ? <Apple size={24} className="text-white"/> : 
                    data.icon === 'SANDWICH' ? (
                        // Custom Sandwich SVG
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                            <path d="M3 13l2-9 16 3-2 9" />
                            <path d="M5 16l1-2" />
                            <path d="M19 19l-1-2" />
                            <rect x="3" y="16" width="18" height="4" rx="1" />
                        </svg>
                    ) : (
                        <Package size={24} className="text-white"/>
                    )
                   }
                </div>
            </div>
        );
      
    default:
      return <div className="text-red-500 font-bold text-[8px]">ERR: TYPE</div>;
  }
};
