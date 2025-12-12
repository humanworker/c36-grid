
import { 
    CoinData, CoinMetal, CoinCondition, CoinBorder, CoinSize, CoinPattern, 
    Artifact, ArtifactType, DesignProfile, Range, ItemData,
    METAL_WEIGHTS, CONDITION_SCORES 
} from '../types';

// --- CONFIGURATION ---

export const XP_VALUES = {
    SCAN_EMPTY: 1,
    SCAN_ITEM: 10,
    SCAN_FOOD: 10,
    BUY_ITEM: 50,
    DEATH_PENALTY: 500,
    LEVEL_THRESHOLD: 1000
};

// --- CATALOGS ---

export interface ShopItemDef {
    id: string;
    type: ArtifactType;
    name: string;
    description: string;
    cost: number;
    levelReq: number;
    effectType: 'HEAL' | 'RANGE_BOOST' | 'SONAR_BOOST' | 'IMMUNITY';
    effectValue: number;
    shelfLifeMs?: number; // Only for food
    icon?: string;
}

export const SUPERMARKET_CATALOG: ShopItemDef[] = [
    {
        id: 'food-sandwich-1',
        type: ArtifactType.FOOD,
        name: 'Sandwich',
        description: 'Fresh. Spoils in 1 hour (game-time).',
        cost: 200,
        levelReq: 1,
        effectType: 'HEAL',
        effectValue: 20,
        shelfLifeMs: 60 * 60 * 1000, // 1 Hour
        icon: 'SANDWICH'
    },
    {
        id: 'food-ration-1',
        type: ArtifactType.FOOD,
        name: 'Basic Rations',
        description: 'Standard issue nutrient paste. Keeps for 24 hours.',
        cost: 50,
        levelReq: 1,
        effectType: 'HEAL',
        effectValue: 20,
        shelfLifeMs: 24 * 60 * 60 * 1000 // 24 Hours
    },
    {
        id: 'food-can-1',
        type: ArtifactType.FOOD,
        name: 'Canned Beans',
        description: 'Preserved protein. Lasts a week.',
        cost: 150,
        levelReq: 2,
        effectType: 'HEAL',
        effectValue: 40,
        shelfLifeMs: 7 * 24 * 60 * 60 * 1000 // 7 Days
    },
    {
        id: 'food-mre-1',
        type: ArtifactType.FOOD,
        name: 'M.R.E.',
        description: 'Military Meal Ready-to-Eat. Lasts 30 days.',
        cost: 300,
        levelReq: 4,
        effectType: 'HEAL',
        effectValue: 80,
        shelfLifeMs: 30 * 24 * 60 * 60 * 1000 // 30 Days
    }
];

export const TOOLSHOP_CATALOG: ShopItemDef[] = [
    {
        id: 'tool-battery-1',
        type: ArtifactType.TOOL,
        name: 'Signal Booster',
        description: 'Boosts detector range for 10 minutes.',
        cost: 200,
        levelReq: 1,
        effectType: 'RANGE_BOOST',
        effectValue: 10 * 60 * 1000 // 10 mins
    },
    {
        id: 'tool-sonar-1',
        type: ArtifactType.TOOL,
        name: 'Sonar Battery',
        description: 'Powers the sonar module for 5 minutes.',
        cost: 300,
        levelReq: 2,
        effectType: 'SONAR_BOOST',
        effectValue: 5 * 60 * 1000 // 5 mins
    },
    {
        id: 'tool-medkit-1',
        type: ArtifactType.TOOL,
        name: 'Stim-Pack',
        description: 'Grants temporary immunity to environmental hazards (2 mins).',
        cost: 500,
        levelReq: 5,
        effectType: 'IMMUNITY',
        effectValue: 2 * 60 * 1000 
    }
];


// --- USER GENERATED PRESETS ---

// Weighted Probability Distribution (Total 100 entries)
const BASE_METALS_WEIGHTED: CoinMetal[] = [
    ...Array(1).fill(CoinMetal.Platinum),  // 1%
    ...Array(2).fill(CoinMetal.Gold),      // 2%
    ...Array(5).fill(CoinMetal.Silver),    // 5%
    ...Array(8).fill(CoinMetal.Bronze),    // 8%
    ...Array(10).fill(CoinMetal.Aluminium),// 10%
    ...Array(12).fill(CoinMetal.Brass),    // 12%
    ...Array(15).fill(CoinMetal.Zinc),     // 15%
    ...Array(20).fill(CoinMetal.Nickel),   // 20%
    ...Array(27).fill(CoinMetal.Copper),   // 27%
];

// "Generator 1" - Ancient, high jitter, detailed floral patterns
export const GENERATOR_ANCIENT: DesignProfile = {
    allowedMetals: BASE_METALS_WEIGHTED,
    yearRange: { min: -500, max: 1800 },
    allowedPatterns: [
      CoinPattern.Geometric, CoinPattern.Stars, CoinPattern.Circles, CoinPattern.Bricks, 
      CoinPattern.Spiral, CoinPattern.Rings, CoinPattern.Stripes, CoinPattern.Target, 
      CoinPattern.Sunburst, CoinPattern.Moon, CoinPattern.Shield, CoinPattern.Crown, 
      CoinPattern.Anchor, CoinPattern.Tree, CoinPattern.Ocean, CoinPattern.Fire
    ],
    shapeJitter: { min: 0.8, max: 5.7 },
    petalCount: { min: 20, max: 24 },
    petalLength: { min: 0.4, max: 0.71 },
    petalWidth: { min: 0.55, max: 0.59 },
    petalSharpness: { min: 1.5, max: 2 },
    centerRadius: { min: 0.28, max: 0.6 }
};


// --- UTILS ---

// High-quality pseudo-random number generator
export const seededRandom = (seed: number) => {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
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
            // USE THE NEW PROFILE GENERATOR (ANCIENT PRESET)
            data = generateCoinFromProfile(cellX, cellY, GENERATOR_ANCIENT);
            rarityScore = calculateCoinScore(data);
            monetaryValue = calculateCoinValue(data);
            break;
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

export const generateShopArtifact = (def: ShopItemDef): Artifact => {
    const data: ItemData = {
        name: def.name,
        description: def.description,
        effectValue: def.effectValue,
        effectType: def.effectType,
        shelfLifeMs: def.shelfLifeMs,
        icon: def.icon,
        // Spoilage is set when purchased
    };
    
    return {
        id: `${def.id}-${Date.now()}`,
        type: def.type,
        foundAt: { x: 0, y: 0 },
        foundDate: Date.now(),
        rarityScore: 0,
        monetaryValue: def.cost, // Represents Cost here
        data
    };
};

/**
 * NEW: Generates CoinData + VisualOverrides based on a DesignProfile (Constraint set).
 * Uses cell coordinates as a seed for Deterministic Procedural Generation.
 */
const generateCoinFromProfile = (cellX: number, cellY: number, profile: DesignProfile): CoinData => {
    // 1. Create a stable seed from coordinates
    const seed = Math.abs(cellX * 49157 + cellY * 98953);
    
    // Helper to get deterministic random number (0.0 - 1.0)
    const rand = (offset: number) => seededRandom(seed + offset);
    
    // Helper to pick from array
    const pick = <T>(arr: T[], offset: number): T => arr[Math.floor(rand(offset) * arr.length)];
    
    // Helper to pick from Range
    const val = (r: Range, offset: number, step = 0.01): number => {
        const v = r.min + (rand(offset) * (r.max - r.min));
        return Math.round(v / step) * step;
    };

    // 2. Generate Base DNA
    const metal = pick(profile.allowedMetals, 1);
    const year = Math.floor(val(profile.yearRange, 2, 1));
    const pattern = pick(profile.allowedPatterns, 3);
    
    // Condition logic based on Year (Older = likely worse)
    const age = 2025 - year;
    const condRoll = rand(4);
    let condition = CoinCondition.Good;
    if (age > 1000) condition = condRoll > 0.8 ? CoinCondition.Fine : CoinCondition.Poor;
    else if (age > 200) condition = condRoll > 0.7 ? CoinCondition.VeryFine : CoinCondition.Good;
    else condition = condRoll > 0.9 ? CoinCondition.Mint : CoinCondition.NearMint;

    // Size & Border (Standard randomized for now, could be added to profile later)
    const sizes = Object.values(CoinSize);
    const size = sizes[Math.floor(rand(5) * sizes.length)];
    
    const borders = Object.values(CoinBorder);
    const border = borders[Math.floor(rand(6) * borders.length)];

    // 3. Generate Visual Overrides (The Workbench DNA)
    const visualOverrides = {
        shapeJitter: val(profile.shapeJitter, 10, 0.1),
        
        petalCount: Math.round(val(profile.petalCount, 11, 1)),
        petalLength: val(profile.petalLength, 12),
        petalWidth: val(profile.petalWidth, 13),
        petalSharpness: val(profile.petalSharpness, 14),
        centerRadius: val(profile.centerRadius, 15),

        // Color overrides (if null in profile, undefined here, causing fallback to natural metal)
        customBaseColor: profile.customBaseColor,
        customShineColor: profile.customShineColor,
        customDarkColor: profile.customDarkColor,
    };

    return {
        metal,
        year,
        condition,
        border,
        size,
        pattern,
        visualOverrides
    };
};

// --- C-36 GRID PROCEDURAL GENERATION LOGIC ---

export type CellType = 'EMPTY' | 'SUPERMARKET' | 'TOOL_SHOP' | 'FOOD' | 'COIN' | 'HOSTILE';

export const getCellType = (cellX: number, cellY: number): CellType => {
    const dot = cellX * 12.9898 + cellY * 78.233;
    const sin = Math.sin(dot) * 43758.5453;
    const random0to1 = sin - Math.floor(sin);
    const masterScore = Math.floor(random0to1 * 100);

    if (masterScore >= 90) return 'HOSTILE'; // 10%
    if (masterScore >= 80) return 'COIN';    // 10%
    if (masterScore >= 70) return 'FOOD';    // 10%
    if (masterScore === 59) {
        // Split 1% Shop chance into two types
        // Use coordinates to determine type deterministically
        const subHash = Math.abs(cellX + cellY) % 2;
        return subHash === 0 ? 'SUPERMARKET' : 'TOOL_SHOP';
    }
    return 'EMPTY';                          // 69%
};
