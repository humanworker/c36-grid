
// Data structures defined in "The C-36 Grid: Design Specification v2.0"

// --- 1. ENUMS ---

export enum ArtifactType {
  COIN = 'COIN',
  FOOD = 'FOOD',
  TOOL = 'TOOL',
  // Future types:
  // MOSAIC = 'MOSAIC',
  // SPOON = 'SPOON',
}

export enum CoinMetal {
  Copper = 'Copper',
  Nickel = 'Nickel',
  Zinc = 'Zinc',
  Brass = 'Brass',
  Aluminium = 'Aluminium',
  Bronze = 'Bronze',
  Silver = 'Silver',
  Gold = 'Gold',
  Platinum = 'Platinum',
}

export enum CoinCondition {
  Poor = 'Poor',
  Good = 'Good',
  Fine = 'Fine',
  VeryFine = 'Very Fine',
  NearMint = 'Near Mint',
  Mint = 'Mint',
}

export enum CoinBorder {
  Thin = 'Thin',
  Standard = 'Standard',
  Wide = 'Wide',
}

export enum CoinSize {
  Tiny = 'Tiny (10mm)',
  Small = 'Small (20mm)',
  Medium = 'Medium (30mm)',
  Large = 'Large (40mm)',
}

export enum CoinPattern {
  Geometric = 'Geometric',
  Floral = 'Floral',
  Imperial = 'Imperial',
  Abstract = 'Abstract',
  Radial = 'Radial',
  Grid = 'Grid',
  Dots = 'Dots',
  Waves = 'Waves',
  Crosses = 'Crosses',
  Stars = 'Stars',
  Circles = 'Circles',
  Triangles = 'Triangles',
  Hexagons = 'Hexagons',
  Diamonds = 'Diamonds',
  Scales = 'Scales',
  Bricks = 'Bricks',
  Maze = 'Maze',
  Spiral = 'Spiral',
  Rings = 'Rings',
  Checks = 'Checks',
  Stripes = 'Stripes',
  Zigzag = 'Zigzag',
  Chevron = 'Chevron',
  Mosaic = 'Mosaic',
  Target = 'Target',
  Sunburst = 'Sunburst',
  Moon = 'Moon',
  Shield = 'Shield',
  Crown = 'Crown',
  Anchor = 'Anchor',
  Leaf = 'Leaf',
  Tree = 'Tree',
  Mountain = 'Mountain',
  Ocean = 'Ocean',
  Wind = 'Wind',
  Fire = 'Fire',
}

// --- 2. DATA INTERFACES ---

// --- VISUAL OVERRIDES (The Output of the Workbench) ---
export interface CoinVisualOverrides {
  // Shape & Form
  shapeJitter?: number; // 0.0 to 10.0 (Irregularity)
  
  // Color Overrides
  customBaseColor?: string; // Hex
  customShineColor?: string; // Hex
  customDarkColor?: string; // Hex

  // Pattern Parametrics (Floral Engine)
  petalCount?: number;     // 3 to 24
  petalLength?: number;    // 0.1 to 1.0 (Ratio of radius)
  petalWidth?: number;     // 0.1 to 1.0
  petalSharpness?: number; // 0.1 to 2.0
  centerRadius?: number;   // 0.1 to 0.5
  innerLines?: number;     // 0 to 8
  innerLineLen?: number;   // 0.1 to 1.0
  
  // Pattern Style
  centerStyle?: 0 | 1 | 2; // 0:Plain, 1:Rings, 2:Dots
}

// Specific Data for Coins
export interface CoinData {
  metal: CoinMetal;
  year: number; // 2025 AD to ~500 BC
  condition: CoinCondition;
  border: CoinBorder;
  size: CoinSize;
  pattern: CoinPattern;
  visualOverrides?: CoinVisualOverrides; // Stored DNA from procedural generation
}

// Data for Consumables/Tools
export interface ItemData {
    name: string;
    description: string;
    effectValue: number; // HP amount or Duration in ms
    effectType: 'HEAL' | 'RANGE_BOOST' | 'SONAR_BOOST' | 'IMMUNITY';
    shelfLifeMs?: number; // Original shelf life constant
    remainingLifeMs?: number; // Countdown for gameplay-time spoilage
    spoilageTimestamp?: number; // DEPRECATED: Old real-time spoilage
    icon?: string; // Icon identifier
}

// --- DESIGN PROFILE (The Input/Constraints) ---

export interface Range {
    min: number;
    max: number;
}

export interface DesignProfile {
    // Base DNA Constraints
    allowedMetals: CoinMetal[];
    yearRange: Range;
    allowedPatterns: CoinPattern[];
    
    // Visual Parametric Ranges
    shapeJitter: Range;
    petalCount: Range;
    petalLength: Range;
    petalWidth: Range;
    petalSharpness: Range;
    centerRadius: Range;
    
    // Colors (Fixed overrides for the profile, or undefined for procedural)
    customBaseColor?: string;
    customShineColor?: string;
    customDarkColor?: string;
}

// Project Structure for LocalStorage
export interface DesignProject {
  id: string;
  name: string;
  updatedAt: number;
  type: ArtifactType;
  profile: DesignProfile; // Replaces baseData/overrides
}

// Generic Wrapper for All Collectables
export interface Artifact {
  id: string;              // Unique UUID
  type: ArtifactType;      // Discriminator
  foundAt: { x: number, y: number };
  foundDate: number;       // Timestamp
  
  // Pre-calculated stats for sorting/inventory
  rarityScore: number;     // 0.0 - 10.0
  monetaryValue: number;   // $ Value (or Cost)
  
  // The specific DNA of the object
  data: CoinData | ItemData; 
}

// --- 3. CONFIG & WEIGHTS ---

// Weights from Section 3.1
export const METAL_WEIGHTS: Record<CoinMetal, number> = {
  [CoinMetal.Copper]: 1.0,
  [CoinMetal.Nickel]: 2.0,
  [CoinMetal.Zinc]: 3.0,
  [CoinMetal.Brass]: 4.0,
  [CoinMetal.Aluminium]: 5.0,
  [CoinMetal.Bronze]: 6.5,
  [CoinMetal.Silver]: 8.0,
  [CoinMetal.Gold]: 9.5,
  [CoinMetal.Platinum]: 10.0,
};

// Condition Score (1-6)
export const CONDITION_SCORES: Record<CoinCondition, number> = {
  [CoinCondition.Poor]: 1,
  [CoinCondition.Good]: 2,
  [CoinCondition.Fine]: 3,
  [CoinCondition.VeryFine]: 4,
  [CoinCondition.NearMint]: 5,
  [CoinCondition.Mint]: 6,
};
