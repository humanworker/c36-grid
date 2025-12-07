// Earth radius in meters
const R = 6378137;

export interface GeoPosition {
    lat: number;
    lon: number;
}

export interface GridPosition {
    x: number;
    y: number;
}

/**
 * Converts Latitude/Longitude to Cartesian Meters (Web Mercator Projection approximation)
 * This creates a consistent X/Y grid in meters where 0,0 is Null Island.
 */
export const latLonToMeters = (lat: number, lon: number): GridPosition => {
    const x = (lon * 20037508.34) / 180;
    let y = Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180);
    y = (y * 20037508.34) / 180;
    return { x, y };
};

/**
 * Calculates distance in meters between two grid points
 */
export const getDistance = (p1: GridPosition, p2: GridPosition): number => {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy);
};

/**
 * Format coordinate for display (e.g. 51.50 N, 0.12 W)
 */
export const formatCoordinate = (lat: number, lon: number): string => {
    const latDir = lat >= 0 ? 'N' : 'S';
    const lonDir = lon >= 0 ? 'E' : 'W';
    return `${Math.abs(lat).toFixed(4)}° ${latDir}, ${Math.abs(lon).toFixed(4)}° ${lonDir}`;
};