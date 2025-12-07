import React from 'react';
import { Artifact, ArtifactType, CoinData } from '../types';
import { CoinRender } from './CoinRender';

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
      
    // Future Expansion:
    // case ArtifactType.MOSAIC:
    //   return <MosaicRender data={artifact.data as MosaicData} />;

    default:
      return <div className="text-red-500 font-bold">ERR: UNKNOWN ARTIFACT</div>;
  }
};