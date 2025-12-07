import { Artifact, ArtifactType } from '../types';
import { CellType } from './gameLogic';

const STORAGE_KEY = 'c36_save_v1';

export interface GameState {
    hp: number;
    balance: number;
    inventory: Artifact[];
    visited: Record<string, CellType>;
    detectorExpiry: number | null;
    manualMode: boolean; // Persist dev setting
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
            detectorExpiry: state.detectorExpiry || null,
            manualMode: !!state.manualMode
        };
    } catch (e) {
        console.error("Failed to load game", e);
        return null;
    }
};