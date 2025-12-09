import React, { useId, useMemo } from 'react';
import { CoinData, CoinSize, CoinBorder, CoinVisualOverrides, CoinCondition } from '../types';
import { getMetalPalette, adjustColor, seededRandom } from '../utils/gameLogic';

interface CoinRenderProps {
  data: CoinData;
  overrides?: CoinVisualOverrides;
}

// Map existing patterns to "DNA" for the Floral Generator
const getPatternDNA = (patternName: string): [number, number, number, number] => {
    // Hash the string to get 4 numbers between 0-35
    let hash = 0;
    for (let i = 0; i < patternName.length; i++) {
        hash = (hash << 5) - hash + patternName.charCodeAt(i);
        hash |= 0;
    }
    const rng = (offset: number) => Math.floor(Math.abs(seededRandom(hash + offset) * 36));
    return [rng(1), rng(2), rng(3), rng(4)];
};

export const CoinRender: React.FC<CoinRenderProps> = ({ data, overrides }) => {
  const uniquePrefix = useId(); 

  // MERGE OVERRIDES: Props > Data.Overrides > Undefined
  const mergedOverrides = overrides || data.visualOverrides;

  // --- 1. Dimensions ---
  const getSizeInPixels = (s: CoinSize) => {
    switch (s) {
      case CoinSize.Tiny: return 120;
      case CoinSize.Small: return 160;
      case CoinSize.Medium: return 200;
      case CoinSize.Large: return 240;
    }
  };

  const diameter = getSizeInPixels(data.size);
  const radius = diameter / 2;
  const borderWidth = data.border === CoinBorder.Thin ? 4 : data.border === CoinBorder.Wide ? 24 : 12;
  
  // Color Palette Construction
  const palette = useMemo(() => {
    const std = getMetalPalette(data.metal);
    return {
        base: mergedOverrides?.customBaseColor || std.base,
        dark: mergedOverrides?.customDarkColor || std.dark,
        shine: mergedOverrides?.customShineColor || std.shine
    };
  }, [data.metal, mergedOverrides]);

  const innerRadius = radius - borderWidth;
  const patternRadius = innerRadius * 0.85; 

  // --- 2. Irregular Shape Generator (Age Based or Overridden) ---
  const shapePath = useMemo(() => {
    let maxJitter = 0;
    
    if (mergedOverrides?.shapeJitter !== undefined) {
        maxJitter = mergedOverrides.shapeJitter;
    } else {
        if (data.year < 1700) {
            const ageFactor = Math.min(1, Math.max(0, (1700 - data.year) / 2200));
            maxJitter = ageFactor * 6;
        }
    }

    if (maxJitter === 0 && data.year >= 1700 && mergedOverrides?.shapeJitter === undefined) {
         return `M ${radius} 0 A ${radius} ${radius} 0 1 1 ${radius} ${diameter} A ${radius} ${radius} 0 1 1 ${radius} 0 Z`;
    }

    const seedBase = data.metal.length + data.year + data.pattern.length;
    const points = 36; 
    let d = "";
    
    for (let i = 0; i < points; i++) {
        const angle = (Math.PI * 2 * i) / points;
        const rnd = seededRandom(seedBase + i);
        const r = radius - (rnd * maxJitter); 
        const px = radius + Math.cos(angle) * r;
        const py = radius + Math.sin(angle) * r;
        
        d += (i === 0 ? `M ${px} ${py}` : ` L ${px} ${py}`);
    }
    d += " Z";
    return d;

  }, [data.year, radius, diameter, data.metal, data.pattern, mergedOverrides?.shapeJitter]);


  // --- 3. Procedural Pattern Generator (Floral Engine) ---
  const patternPath = useMemo(() => {
      const [v1, v2, v3, v4] = getPatternDNA(data.pattern);
      
      const map = (n: number, s1: number, st1: number, s2: number, st2: number) => 
        ((n - s1) / (st1 - s1)) * (st2 - s2) + s2;

      const numPetals = mergedOverrides?.petalCount ?? Math.floor(map(v1, 0, 35, 3, 16));
      const petalLen = mergedOverrides?.petalLength ? mergedOverrides.petalLength * patternRadius : map(v2, 0, 35, patternRadius * 0.4, patternRadius * 0.9);
      const petalWidth = mergedOverrides?.petalWidth ? mergedOverrides.petalWidth * patternRadius : map(v2, 0, 35, patternRadius * 0.1, patternRadius * 0.5);
      const sharpness = mergedOverrides?.petalSharpness ?? map(v2 % 10, 0, 9, 0.1, 1.5);
      
      const innerLines = mergedOverrides?.innerLines ?? Math.floor(map(v3, 0, 35, 0, 5));
      const innerLineLen = mergedOverrides?.innerLineLen ?? map(v3, 0, 35, 0.2, 0.9);
      
      const centerRadius = mergedOverrides?.centerRadius ? mergedOverrides.centerRadius * patternRadius : map(v4, 0, 35, patternRadius * 0.1, patternRadius * 0.3);
      const centerStyle = mergedOverrides?.centerStyle ?? (v4 % 3);

      let d = "";

      const angleStep = (Math.PI * 2) / numPetals;
      for (let i = 0; i < numPetals; i++) {
          const rotation = i * angleStep;
          const cos = Math.cos(rotation);
          const sin = Math.sin(rotation);
          
          const rot = (x: number, y: number) => ({
              x: radius + (x * cos - y * sin),
              y: radius + (x * sin + y * cos)
          });

          let cpX = petalWidth * sharpness;
          let cpY = centerRadius + (petalLen / 2);
          
          const pStart = rot(0, centerRadius);
          const cp1 = rot(cpX, cpY);
          const pTip = rot(0, centerRadius + petalLen);
          const cp2 = rot(-cpX, cpY);

          d += ` M ${pStart.x} ${pStart.y}`;
          d += ` Q ${cp1.x} ${cp1.y} ${pTip.x} ${pTip.y}`;
          d += ` Q ${cp2.x} ${cp2.y} ${pStart.x} ${pStart.y}`;

          if (innerLines > 0) {
              for (let j = 1; j <= innerLines; j++) {
                  let scale = j / (innerLines + 1);
                  let subLen = petalLen * innerLineLen;
                  
                  let iCpX = (cpX * scale) * 0.8;
                  let iCpY = centerRadius + (subLen / 2);
                  
                  const ipStart = rot(0, centerRadius + 2);
                  const icp1 = rot(iCpX, iCpY);
                  const ipTip = rot(0, centerRadius + subLen);
                  const icp2 = rot(-iCpX, iCpY);
                  
                  d += ` M ${ipStart.x} ${ipStart.y}`;
                  d += ` Q ${icp1.x} ${icp1.y} ${ipTip.x} ${ipTip.y}`;
                  d += ` Q ${icp2.x} ${icp2.y} ${ipStart.x} ${ipStart.y}`;
              }
          }
      }

      // Center path (For Hole Masking)
      const centerPath = `M ${radius + centerRadius} ${radius} A ${centerRadius} ${centerRadius} 0 1 0 ${radius - centerRadius} ${radius} A ${centerRadius} ${centerRadius} 0 1 0 ${radius + centerRadius} ${radius}`;
      
      if (centerStyle === 1) { // Rings
         let rings = Math.floor(map(v4, 0, 35, 1, 3));
         for(let k=1; k<=rings; k++) {
             const r = centerRadius * (k/(rings+1));
             d += ` M ${radius + r} ${radius} A ${r} ${r} 0 1 0 ${radius - r} ${radius} A ${r} ${r} 0 1 0 ${radius + r} ${radius}`;
         }
      } else if (centerStyle === 2) { // Dots
         let dots = Math.floor(map(v4, 0, 35, 3, 8));
         let dotRad = centerRadius * 0.6;
         for(let k=0; k<dots; k++) {
             let ang = (Math.PI * 2 / dots) * k;
             let dx = radius + Math.cos(ang) * dotRad;
             let dy = radius + Math.sin(ang) * dotRad;
             d += ` M ${dx + 2} ${dy} A 2 2 0 1 0 ${dx - 2} ${dy} A 2 2 0 1 0 ${dx + 2} ${dy}`;
         }
      }

      return { d, centerPath };

  }, [data.pattern, radius, patternRadius, mergedOverrides]);

  // --- 4. Render IDs ---
  const gradientId = `grad-${uniquePrefix}`;
  const clipId = `clip-${uniquePrefix}`;
  const holeMaskId = `hole-${uniquePrefix}`;
  const erosionMaskId = `erode-${uniquePrefix}`;
  const grainId = `grain-${uniquePrefix}`;
  const grimeId = `grime-${uniquePrefix}`;

  // --- 5. Configuration & Visual Tuning ---
  const config = useMemo(() => {
     switch (data.condition) {
      case CoinCondition.Poor:     return { erosion: 0.85, grime: 0.6, luster: 0.1, shineSharpness: 0, noiseFreq: 0.8 }; 
      case CoinCondition.Good:     return { erosion: 0.60, grime: 0.4, luster: 0.3, shineSharpness: 0, noiseFreq: 0.6 };
      case CoinCondition.Fine:     return { erosion: 0.30, grime: 0.3, luster: 0.5, shineSharpness: 0.1, noiseFreq: 0.5 };
      case CoinCondition.VeryFine: return { erosion: 0.10, grime: 0.2, luster: 0.7, shineSharpness: 0.3, noiseFreq: 0.4 };
      case CoinCondition.NearMint: return { erosion: 0.02, grime: 0.1, luster: 0.9, shineSharpness: 0.6, noiseFreq: 0.3 };
      case CoinCondition.Mint:     return { erosion: 0.00, grime: 0.0, luster: 1.0, shineSharpness: 1.0, noiseFreq: 0.2 };
    }
  }, [data.condition]);

  // Relief Layer Component for 3D Stamped Look
  const ReliefLayer = ({ d, strokeWidth, opacity = 1 }: { d: string, strokeWidth: number, opacity?: number }) => (
    <g opacity={opacity}>
        <path d={d} stroke="black" strokeWidth={strokeWidth} fill="none" transform="translate(0.5, 0.5)" opacity="0.5" />
        <path d={d} stroke="white" strokeWidth={strokeWidth} fill="none" transform="translate(-0.5, -0.5)" opacity={0.3 * config.luster} />
        <path d={d} stroke={palette.dark} strokeWidth={strokeWidth} fill="none" />
    </g>
  );

  // --- 6. 3D Edge Generation ---
  // Combine outer shape + inner hole for "EvenOdd" fill rule (solid shape with hole)
  const solidBodyPath = `${shapePath} ${patternPath.centerPath}`;
  const edgeColor = adjustColor(palette.dark, -40); // Much darker for shadow
  const edgeThickness = 12; // Pixels of thickness
  const tiltScale = 0.85;   // Scale Y to simulate 30deg tilt

  return (
      <svg 
        width="100%"
        height="100%"
        viewBox={`0 0 ${diameter} ${diameter}`} // Keeping viewBox standard, we scale content inside
        className="drop-shadow-2xl overflow-visible"
        style={{ overflow: 'visible' }} // Allow 3D edge to hang out bottom
      >
        <defs>
            <clipPath id={clipId}>
                <path d={shapePath} />
            </clipPath>

            {/* HOLE MASK: Transparent center */}
            <mask id={holeMaskId}>
                <rect x="0" y="0" width={diameter} height={diameter} fill="white" />
                <path d={patternPath.centerPath} fill="black" />
            </mask>

            {/* EROSION MASK */}
            <mask id={erosionMaskId}>
                <rect x="0" y="0" width={diameter} height={diameter} fill="white" />
                {config.erosion > 0 && (
                     <>
                        <filter id={`noise-${uniquePrefix}`}>
                            <feTurbulence type="fractalNoise" baseFrequency="0.08" numOctaves="4" seed={data.year} />
                            <feColorMatrix type="matrix" values="0 0 0 0 0, 0 0 0 0 0, 0 0 0 0 0, 0 0 0 -9 4" />
                        </filter>
                        <rect 
                            x="0" y="0" width={diameter} height={diameter} 
                            fill="black" 
                            filter={`url(#noise-${uniquePrefix})`} 
                            opacity={config.erosion}
                        />
                     </>
                )}
            </mask>

            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
                {config.shineSharpness > 0.5 ? (
                    <>
                        <stop offset="0%" stopColor={palette.dark} />
                        <stop offset="25%" stopColor={palette.base} />
                        <stop offset="45%" stopColor={palette.shine} />
                        <stop offset="55%" stopColor={palette.shine} />
                        <stop offset="75%" stopColor={palette.base} />
                        <stop offset="100%" stopColor={palette.dark} />
                    </>
                ) : (
                    <>
                        <stop offset="0%" stopColor={palette.shine} />
                        <stop offset="40%" stopColor={palette.base} />
                        <stop offset="100%" stopColor={palette.dark} />
                    </>
                )}
            </linearGradient>

            <filter id={grainId} x="0%" y="0%" width="100%" height="100%">
                <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" result="noise"/>
                <feColorMatrix type="matrix" values="1 0 0 0 0  1 0 0 0 0  1 0 0 0 0  0 0 0 0.15 0" in="noise" result="coloredNoise"/>
            </filter>

            <filter id={grimeId}>
                <feTurbulence type="fractalNoise" baseFrequency={config.noiseFreq} numOctaves="3" />
                <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" />
                <feComponentTransfer>
                    <feFuncA type="linear" slope="1.5" intercept="-0.2" />
                </feComponentTransfer>
            </filter>
        </defs>

        {/* --- 3D TRANSFORM GROUP --- */}
        {/* We scale down slightly (0.9) to make room for the edge thickness in the viewbox */}
        <g transform={`scale(0.9, ${0.9 * tiltScale}) translate(${diameter * 0.05}, ${diameter * 0.05})`}>
            
            {/* 1. EXTRUDED EDGE (Rendered First / Behind) */}
            {/* Creates thickness at the bottom edge and inner hole top edge */}
            {Array.from({ length: 8 }).map((_, i) => {
                const offset = edgeThickness - i; // Render from bottom up to avoid Z-fighting logic, though SVG painter model handles this naturally if order is right
                // Actually, painter model: First drawn is bottom.
                // We want the deepest part drawn first.
                return (
                    <path 
                        key={i}
                        d={solidBodyPath}
                        fillRule="evenodd"
                        transform={`translate(0, ${offset})`}
                        fill={edgeColor}
                        stroke={edgeColor}
                        strokeWidth={1}
                    />
                );
            })}

            {/* 2. MAIN FACE (Rendered On Top) */}
            <g mask={`url(#${holeMaskId})`}>
                <g clipPath={`url(#${clipId})`}>
                    
                    {/* Base Metal */}
                    <rect x="0" y="0" width={diameter} height={diameter} fill={`url(#${gradientId})`} />
                    <rect x="0" y="0" width={diameter} height={diameter} filter={`url(#${grainId})`} opacity="0.4" style={{ mixBlendMode: 'overlay' }} />

                    {/* Pattern */}
                    <g mask={`url(#${erosionMaskId})`}>
                        <ReliefLayer d={patternPath.d} strokeWidth={2} />
                    </g>

                    {/* Border */}
                    <g mask={`url(#${erosionMaskId})`}>
                        <path d={shapePath} fill="none" stroke={`url(#${gradientId})`} strokeWidth={borderWidth} />
                        <path d={shapePath} fill="none" stroke="black" strokeWidth={1} opacity="0.3" transform={`scale(${(diameter - borderWidth)/diameter}) translate(${borderWidth/2}, ${borderWidth/2})`} />
                        <path d={shapePath} fill="none" stroke="white" strokeWidth={1} opacity={0.3 * config.luster} transform={`scale(${(diameter - borderWidth)/diameter}) translate(${borderWidth/2 - 1}, ${borderWidth/2 - 1})`} />
                    </g>

                    {/* Grime */}
                    {config.grime > 0 && (
                        <rect x="0" y="0" width={diameter} height={diameter} fill="#1a1a1a" filter={`url(#${grimeId})`} opacity={config.grime} style={{ mixBlendMode: 'multiply' }} />
                    )}
                </g>
            </g>
            
            {/* Edge Highlight (Top face rim) */}
            <path d={shapePath} fill="none" stroke="white" strokeWidth="0.5" strokeOpacity={0.4 * config.luster} />
        </g>

      </svg>
  );
};