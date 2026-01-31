import { MapBounds } from "../types";
import { TILE_LAYER_URL, CACHE_NAME, MAX_TILES_PER_DOWNLOAD } from "../constants";

// Helper to convert Lat/Lon to Tile Coordinates
const long2tile = (lon: number, zoom: number) => {
  return (Math.floor((lon + 180) / 360 * Math.pow(2, zoom)));
};

const lat2tile = (lat: number, zoom: number) => {
  return (Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom)));
};

interface TileInfo {
  x: number;
  y: number;
  z: number;
  url: string;
}

export const calculateTilesInBounds = (bounds: MapBounds, depth: number = 0): TileInfo[] => {
  const tiles: TileInfo[] = [];
  
  // Iterate through current zoom level up to depth
  for (let z = bounds.zoom; z <= bounds.zoom + depth; z++) {
    const left = long2tile(bounds.west, z);
    const right = long2tile(bounds.east, z);
    const top = lat2tile(bounds.north, z);
    const bottom = lat2tile(bounds.south, z);

    for (let x = left; x <= right; x++) {
      for (let y = top; y <= bottom; y++) {
        // Construct standard OSM URL format
        // Note: Simple replacement, robust impl would handle subdomains {s}
        const s = ['a', 'b', 'c'][(x + y) % 3];
        const url = TILE_LAYER_URL
          .replace('{s}', s)
          .replace('{z}', z.toString())
          .replace('{x}', x.toString())
          .replace('{y}', y.toString());
        
        tiles.push({ x, y, z, url });
      }
    }
  }
  return tiles;
};

export const downloadTiles = async (
  tiles: TileInfo[], 
  onProgress: (completed: number, total: number) => void
): Promise<void> => {
  if (tiles.length > MAX_TILES_PER_DOWNLOAD) {
    throw new Error(`Too many tiles (${tiles.length}). Please zoom in to select a smaller region.`);
  }

  const cache = await caches.open(CACHE_NAME);
  let completed = 0;

  // Process in chunks to avoid blocking network too much
  const CHUNK_SIZE = 5;
  for (let i = 0; i < tiles.length; i += CHUNK_SIZE) {
    const chunk = tiles.slice(i, i + CHUNK_SIZE);
    
    await Promise.all(chunk.map(async (tile) => {
      try {
        const match = await cache.match(tile.url);
        if (!match) {
          const response = await fetch(tile.url, { mode: 'cors' });
          if (response.ok) {
            await cache.put(tile.url, response);
          }
        }
      } catch (e) {
        console.warn(`Failed to cache tile ${tile.url}`, e);
      } finally {
        completed++;
        onProgress(completed, tiles.length);
      }
    }));
  }
};

export const getStorageEstimate = async (): Promise<{ usage: number; quota: number }> => {
  if (navigator.storage && navigator.storage.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      return {
        usage: estimate.usage || 0,
        quota: estimate.quota || 0
      };
    } catch (e) {
      console.warn("Storage estimate failed", e);
    }
  }
  return { usage: 0, quota: 0 };
};

export const clearTileCache = async (): Promise<void> => {
  if ('caches' in window) {
    await caches.delete(CACHE_NAME);
  }
};
