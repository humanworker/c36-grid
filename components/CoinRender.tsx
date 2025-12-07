import React, { useId, useMemo } from 'react';
import { CoinData, CoinSize, CoinBorder, CoinPattern, CoinCondition } from '../types';
import { getMetalPalette, adjustColor } from '../utils/gameLogic';

interface CoinRenderProps {
  data: CoinData;
}

// Simple Pseudo-Random Number Generator for deterministic visuals
const seededRandom = (seed: number) => {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

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

export const CoinRender: React.FC<CoinRenderProps> = ({ data }) => {
  const uniquePrefix = useId(); 

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
  const palette = getMetalPalette(data.metal);
  const innerRadius = radius - borderWidth;
  const patternRadius = innerRadius * 0.85; 

  // --- 2. Irregular Shape Generator (Age Based) ---
  const shapePath = useMemo(() => {
    // If Modern (post 1700), perfect circle
    if (data.year >= 1700) {
        return `M ${radius} 0 A ${radius} ${radius} 0 1 1 ${radius} ${diameter} A ${radius} ${radius} 0 1 1 ${radius} 0 Z`;
    }

    // Irregular Polygon for older coins
    // Irregularity factor increases with age
    // 1700 AD -> 0
    // 500 BC -> Max
    const ageFactor = Math.min(1, Math.max(0, (1700 - data.year) / 2200));
    const maxJitter = ageFactor * 6; // Max 6px jitter for very old coins
    
    // Seed based on coin properties so it's consistent
    const seedBase = data.metal.length + data.year + data.pattern.length;
    
    const points = 36; // Number of vertices
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

  }, [data.year, radius, diameter, data.metal, data.pattern]);


  // --- 3. Procedural Pattern Generator (Floral Engine) ---
  const patternPath = useMemo(() => {
      const [v1, v2, v3, v4] = getPatternDNA(data.pattern);
      
      const map = (n: number, s1: number, st1: number, s2: number, st2: number) => 
        ((n - s1) / (st1 - s1)) * (st2 - s2) + s2;

      const numPetals = Math.floor(map(v1, 0, 35, 3, 16));
      const petalLen = map(v2, 0, 35, patternRadius * 0.4, patternRadius * 0.9);
      const petalWidth = map(v2, 0, 35, patternRadius * 0.1, patternRadius * 0.5);
      const sharpness = map(v2 % 10, 0, 9, 0.1, 1.5);
      
      const innerLines = Math.floor(map(v3, 0, 35, 0, 5));
      const innerLineLen = map(v3, 0, 35, 0.2, 0.9);
      
      const centerRadius = map(v4, 0, 35, patternRadius * 0.1, patternRadius * 0.3);
      const centerStyle = v4 % 3;

      let d = "";

      // Petals
      const angleStep = (Math.PI * 2) / numPetals;
      for (let i = 0; i < numPetals; i++) {
          const rotation = i * angleStep;
          const cos = Math.cos(rotation);
          const sin = Math.sin(rotation);
          
          // Helper to rotate point
          const rot = (x: number, y: number) => ({
              x: radius + (x * cos - y * sin),
              y: radius + (x * sin + y * cos)
          });

          // Petal Shape
          let cpX = petalWidth * sharpness;
          let cpY = centerRadius + (petalLen / 2);
          
          const pStart = rot(0, centerRadius);
          const cp1 = rot(cpX, cpY);
          const pTip = rot(0, centerRadius + petalLen);
          const cp2 = rot(-cpX, cpY);

          d += ` M ${pStart.x} ${pStart.y}`;
          d += ` Q ${cp1.x} ${cp1.y} ${pTip.x} ${pTip.y}`;
          d += ` Q ${cp2.x} ${cp2.y} ${pStart.x} ${pStart.y}`;

          // Inner Lines (Engraving)
          if (innerLines > 0) {
              for (let j = 1; j <= innerLines; j++) {
                  let scale = j / (innerLines + 1);
                  let subLen = petalLen * innerLineLen;
                  
                  // Interpolate control points
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

      // Center
      const centerPath = ` M ${radius + centerRadius} ${radius} A ${centerRadius} ${centerRadius} 0 1 0 ${radius - centerRadius} ${radius} A ${centerRadius} ${centerRadius} 0 1 0 ${radius + centerRadius} ${radius}`;
      
      // Center Details
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
             // Draw tiny circle approx 2px
             d += ` M ${dx + 2} ${dy} A 2 2 0 1 0 ${dx - 2} ${dy} A 2 2 0 1 0 ${dx + 2} ${dy}`;
         }
      }

      return { d, centerPath };

  }, [data.pattern, radius, patternRadius]);

  // --- 4. IDs ---
  const gradientId = `grad-${uniquePrefix}`;
  const clipId = `clip-${uniquePrefix}`;
  const filterId = `scratch-${uniquePrefix}`;

  // --- 5. Configs ---
  const conditionConfig = useMemo(() => {
     switch (data.condition) {
      // Scratches: Low freq X, High freq Y creates streaks
      case CoinCondition.Poor: return { opacity: 0.8, freq: "0.05 2.5", oct: 3 }; 
      case CoinCondition.Good: return { opacity: 0.6, freq: "0.1 2.0", oct: 2 };
      case CoinCondition.Fine: return { opacity: 0.4, freq: "0.2 1.5", oct: 2 };
      case CoinCondition.VeryFine: return { opacity: 0.2, freq: "0.5 1.0", oct: 1 };
      case CoinCondition.NearMint: return { opacity: 0.1, freq: "0.8 1.0", oct: 1 };
      case CoinCondition.Mint: return { opacity: 0.0, freq: "1.0", oct: 1 };
    }
  }, [data.condition]);

  const highlightColor = adjustColor(palette.base, 60); // 30-60% lighter
  
  return (
      <svg 
        width="100%"
        height="100%"
        viewBox={`0 0 ${diameter} ${diameter}`}
        className="drop-shadow-2xl overflow-visible"
      >
        <defs>
            {/* Main Shape Clip */}
            <clipPath id={clipId}>
                <path d={shapePath} />
            </clipPath>

            {/* Metallic Gradient */}
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={palette.shine} />
                <stop offset="40%" stopColor={palette.base} />
                <stop offset="100%" stopColor={palette.dark} />
            </linearGradient>

            {/* Scratch Filter */}
            <filter id={filterId} x="-20%" y="-20%" width="140%" height="140%">
                <feTurbulence 
                  type="fractalNoise" 
                  baseFrequency={conditionConfig.freq} 
                  numOctaves={conditionConfig.oct} 
                  result="noise"
                />
                <feColorMatrix 
                  type="matrix" 
                  values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" // Grayscale
                  in="noise" result="grayNoise"
                />
                 {/* Make noise high contrast for scratches */}
                <feComponentTransfer in="grayNoise">
                    <feFuncA type="linear" slope="3" intercept="-1" />
                </feComponentTransfer>
            </filter>
        </defs>

        <g clipPath={`url(#${clipId})`}>
            
            {/* 1. Base Metal Body */}
            <path d={shapePath} fill={`url(#${gradientId})`} />

            {/* 2. Procedural Pattern (Embossed Effect) */}
            
            {/* Layer A: Shadow (Dark Offset) */}
            <g transform="translate(1, 1)" opacity="0.5">
                <path d={patternPath.d} stroke={palette.dark} strokeWidth="2" fill="none" />
                <path d={patternPath.centerPath} fill={palette.dark} stroke="none" />
            </g>

            {/* Layer B: Highlight (Light Metal) */}
            <g opacity="0.9">
                 <path d={patternPath.d} stroke={highlightColor} strokeWidth="2" fill="none" />
                 <path d={patternPath.centerPath} fill={highlightColor} stroke={palette.dark} strokeWidth="1" />
            </g>

            {/* 3. Scratch/Condition Overlay */}
            {conditionConfig.opacity > 0 && (
                <rect 
                    x="0" y="0" width={diameter} height={diameter}
                    fill="#333" 
                    filter={`url(#${filterId})`}
                    opacity={conditionConfig.opacity}
                    style={{ mixBlendMode: 'multiply' }}
                />
            )}
            
            {/* 4. Inner Rim Highlight */}
             <path 
                d={shapePath} 
                fill="none" 
                stroke={palette.shine} 
                strokeWidth={borderWidth} 
                strokeOpacity="0.3"
                transform="scale(0.95) translate(5,5)" // Fake inner bevel
            />

        </g>

        {/* 5. Outer Border Ring */}
        <path 
            d={shapePath} 
            fill="none"
            stroke={palette.dark}
            strokeWidth={borderWidth}
        />

        {/* 6. Specular Highlight / Shine on top */}
         <path 
            d={shapePath} 
            fill="none"
            stroke="white"
            strokeWidth="1"
            strokeOpacity="0.15"
         />

      </svg>
  );
};
