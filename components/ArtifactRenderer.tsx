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
        return (
            <div className={`${className} bg-green-900/20 flex flex-col items-center justify-center p-2 rounded border border-green-900/50`}>
                <div className="bg-green-500 p-3 rounded-full mb-1">
                   {/* Differentiate map food (Apple) vs Pantry items (Package/Can) */}
                   {(artifact.data as ItemData).name === 'Fruit' ? <Apple size={24} className="text-white"/> : <Package size={24} className="text-white"/>}
                </div>
            </div>
        );
      
    default:
      return <div className="text-red-500 font-bold text-[8px]">ERR: TYPE</div>;
  }
};