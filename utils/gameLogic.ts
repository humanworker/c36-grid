import { 
    CoinData, CoinMetal, CoinCondition, CoinBorder, CoinSize, CoinPattern, 
    Artifact, ArtifactType,
    METAL_WEIGHTS, CONDITION_SCORES 
} from '../types';

// --- CONFIGURATION ---

export const XP_VALUES = {
    SCAN_EMPTY: 1,
    SCAN_ITEM: 10,
    SCAN_FOOD: 10,
    BUY_DETECTOR: 100,
    BUY_SONAR: 100,
    DEATH_PENALTY: 500,
    LEVEL_THRESHOLD: 1000
};

// --- COIN SPECIFIC MATH ---

/**
 * Calculates the "Collector's Score" for a Coin based on PDF Section 3.2
 */
export const calculateCoinScore = (coin: CoinData): number => {
  // 1. Metal Weight (1.0 - 10.0)
  const metalScore = METAL_WEIGHTS[coin.metal];

  // 2. Age Points
  const currentYear = 2025;
  const ageDiff = currentYear - coin.year;
  const maxAgeDiff = 2025 - (-500); // 2525
  const ageScore = (ageDiff / maxAgeDiff) * 10; 

  // 3. Condition Points (1-6) mapped to roughly 0-10 scale
  const conditionScore = CONDITION_SCORES[coin.condition];
  const normalizedCondition = (conditionScore / 6) * 10;

  // Total raw score (Max ~30)
  const rawScore = metalScore + ageScore + normalizedCondition;
  
  // Map to 0.0 - 10.0
  return (rawScore / 30) * 10;
};

export const calculateCoinValue = (coin: CoinData): number => {
    const score = calculateCoinScore(coin);
    // Exponential scale: Score 0 = $1, Score 10 = $1,000,000
    // Formula: 10 ^ (score * 0.6)
    // Score 5 -> 10^3 = $1,000
    // Score 10 -> 10^6 = $1,000,000
    return Math.floor(Math.pow(10, score * 0.6));
};

export interface MetalPalette {
    base: string;
    dark: string;
    shine: string;
}

// Helper to adjust hex color brightness
// amount: +ve for lighter, -ve for darker
export const adjustColor = (hex: string, amount: number): string => {
    const clamp = (val: number) => Math.min(255, Math.max(0, val));
    hex = hex.replace(/^#/, '');
    
    if (hex.length === 3) {
        hex = hex.split('').map(c => c + c).join('');
    }

    const num = parseInt(hex, 16);
    let r = (num >> 16) + amount;
    let g = ((num >> 8) & 0x00FF) + amount;
    let b = (num & 0x0000FF) + amount;

    return `#${(clamp(b) | (clamp(g) << 8) | (clamp(r) << 16)).toString(16).padStart(6, '0')}`;
};

export const getMetalPalette = (metal: string): MetalPalette => {
    switch (metal) {
        case 'Platinum': 
            return { base: '#e2e8f0', dark: '#94a3b8', shine: '#f8fafc' };
        case 'Gold': 
            return { base: '#fbbf24', dark: '#b45309', shine: '#fef3c7' };
        case 'Silver': 
            return { base: '#cbd5e1', dark: '#64748b', shine: '#f1f5f9' };
        case 'Bronze': 
            return { base: '#cd7f32', dark: '#7c2d12', shine: '#fdba74' };
        case 'Copper': 
            return { base: '#c27c4f', dark: '#7c2d12', shine: '#fed7aa' };
        case 'Brass': 
            return { base: '#eab308', dark: '#854d0e', shine: '#fde047' };
        case 'Nickel': 
            return { base: '#a1a1aa', dark: '#52525b', shine: '#e4e4e7' };
        case 'Zinc': 
            return { base: '#71717a', dark: '#3f3f46', shine: '#a1a1aa' };
        case 'Aluminium': 
            return { base: '#d4d4d4', dark: '#737373', shine: '#ffffff' };
        default: 
            return { base: '#525252', dark: '#262626', shine: '#737373' };
    }
};

// --- ARTIFACT FACTORY SYSTEM ---

/**
 * Determines which Artifact Type exists in this region.
 * We define a "Region" as a 50x50 cell area (approx 750m x 750m).
 */
const getArtifactTypeForRegion = (cellX: number, cellY: number): ArtifactType => {
    const REGION_SIZE = 50;
    const regionX = Math.floor(cellX / REGION_SIZE);
    const regionY = Math.floor(cellY / REGION_SIZE);
    
    // Simple hash to decide type
    // Currently only COIN is supported, but this logic prepares for others.
    const availableTypes = [ArtifactType.COIN]; 
    
    const hash = Math.abs((regionX * 31 + regionY * 17)) % availableTypes.length;
    return availableTypes[hash];
};

/**
 * Main Factory Function to Generate an Artifact at a location.
 * This determines Type, generates Data, and wraps it in the standard interface.
 */
export const generateArtifact = (cellX: number, cellY: number): Artifact => {
    const type = getArtifactTypeForRegion(cellX, cellY);
    const id = `art-${cellX}-${cellY}-${Date.now()}`;
    const foundAt = { x: cellX, y: cellY };
    const foundDate = Date.now();

    let data: any;
    let rarityScore = 0;
    let monetaryValue = 0;

    switch (type) {
        case ArtifactType.COIN:
        default:
            data = generateProceduralCoinData(cellX, cellY);
            rarityScore = calculateCoinScore(data);
            monetaryValue = calculateCoinValue(data);
            break;
            
        // Future Case:
        // case ArtifactType.MOSAIC:
        //    data = generateMosaicData(cellX, cellY);
        //    rarityScore = ...
        //    break;
    }

    return {
        id,
        type,
        foundAt,
        foundDate,
        data,
        rarityScore,
        monetaryValue
    };
};

/**
 * Generates the CoinData DNA (Legacy Function updated for internal use)
 */
const generateProceduralCoinData = (cellX: number, cellY: number): CoinData => {
    const L5 = Math.abs(cellY) % 10;
    const l5 = Math.abs(cellX) % 10;
    
    // Simulate L4/l4 (Region Seed) using larger coordinate steps
    const l4 = Math.abs(Math.floor(cellX / 10)) % 36;
    
    // 1. Metal
    const metalRoll = (L5 * l5) * 7 % 100; 
    let metal = CoinMetal.Copper;
    if (metalRoll >= 99) metal = CoinMetal.Platinum;
    else if (metalRoll >= 98) metal = CoinMetal.Gold;
    else if (metalRoll >= 95) metal = CoinMetal.Silver;
    else if (metalRoll >= 90) metal = CoinMetal.Bronze;
    else if (metalRoll >= 80) metal = CoinMetal.Aluminium;
    else if (metalRoll >= 65) metal = CoinMetal.Brass;
    else if (metalRoll >= 50) metal = CoinMetal.Zinc;
    else if (metalRoll >= 30) metal = CoinMetal.Nickel;
    else metal = CoinMetal.Copper;

    // 2. Age
    const ageOffset = ((L5 * 36 + l5) * 2) * 2; 
    let year = 2025 - ageOffset;
    if (year < -500) year = -500 + (Math.abs(year) % 500);

    // 3. Condition
    const conditionIndex = L5 % 6;
    const conditions = Object.values(CoinCondition);
    const condition = conditions[conditionIndex];

    // 4. Border
    const borderIndex = l5 % 3;
    const borders = Object.values(CoinBorder);
    const border = borders[borderIndex];

    // 5. Size
    const sizeIndex = (L5 + l5) % 4;
    const sizes = Object.values(CoinSize);
    const size = sizes[sizeIndex];

    // 6. Pattern
    const patterns = Object.values(CoinPattern);
    const pattern = patterns[l4 % patterns.length];

    return { metal, year, condition, border, size, pattern };
};


// --- C-36 GRID PROCEDURAL GENERATION LOGIC ---

export type CellType = 'EMPTY' | 'SHOP' | 'FOOD' | 'COIN' | 'HOSTILE';

export const getCellType = (cellX: number, cellY: number): CellType => {
    const dot = cellX * 12.9898 + cellY * 78.233;
    const sin = Math.sin(dot) * 43758.5453;
    const random0to1 = sin - Math.floor(sin);
    const masterScore = Math.floor(random0to1 * 100);

    if (masterScore >= 90) return 'HOSTILE'; // 10%
    if (masterScore >= 80) return 'COIN';    // 10%
    if (masterScore >= 70) return 'FOOD';    // 10% (Reduced from 20%)
    if (masterScore === 59) return 'SHOP';   // 1%
    return 'EMPTY';                          // 69%
};