
import { Artifact, ArtifactType } from '../types';
import { CellType } from './gameLogic';

const STORAGE_KEY = 'c36_save_v3'; // Bumped version for Shop Stock update

export interface ShopState {
    restockTime: number; // Timestamp when stock returns
    soldOutItemIds: string[]; // IDs of items currently sold out
}

export interface GameState {
    hp: number;
    balance: number;
    inventory: Artifact[];
    visited: Record<string, CellType>;
    shopStates: Record<string, ShopState>; // New: Track stock per location key "x,y"
    detectorExpiry: number | null;
    sonarExpiry: number | null;
    immunityExpiry: number | null; 
    manualMode: boolean; 
    xp: number;
}

export const saveGameState = (state: GameState) => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
        console.error("Failed to save game", e);
    }
};

export const loadGameState = (): GameState | null => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        
        const state = JSON.parse(raw);
        
        // Basic schema validation / recovery
        return {
            hp: typeof state.hp === 'number' ? state.hp : 50,
            balance: typeof state.balance === 'number' ? state.balance : 0,
            inventory: Array.isArray(state.inventory) ? state.inventory : [],
            visited: state.visited || {},
            shopStates: state.shopStates || {}, // Default empty
            detectorExpiry: state.detectorExpiry || null,
            sonarExpiry: state.sonarExpiry || null,
            immunityExpiry: state.immunityExpiry || null,
            manualMode: !!state.manualMode,
            xp: typeof state.xp === 'number' ? state.xp : 0
        };
    } catch (e) {
        console.error("Failed to load game", e);
        return null;
    }
};
