export const TILE_CACHE_NAME = "osm-tiles-v1";

export function getTileUrl(z: number, x: number, y: number): string {
  return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
}

export function latLngToTile(
  lat: number,
  lng: number,
  zoom: number,
): { x: number; y: number } {
  const z = zoom;
  const x = Math.floor(((lng + 180) / 360) * 2 ** z);
  const y = Math.floor(
    ((1 -
      Math.log(
        Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180),
      ) /
        Math.PI) /
      2) *
      2 ** z,
  );
  return { x, y };
}

export async function getTileFromCache(url: string): Promise<Response | null> {
  try {
    const cache = await caches.open(TILE_CACHE_NAME);
    const response = await cache.match(url);
    return response ?? null;
  } catch {
    return null;
  }
}

export async function cacheTile(url: string): Promise<void> {
  try {
    const cache = await caches.open(TILE_CACHE_NAME);
    const existing = await cache.match(url);
    if (existing) return;
    const response = await fetch(url);
    if (response.ok) {
      await cache.put(url, response);
    }
  } catch {
    // no-op
  }
}

export function estimateTileCount(
  bounds: { north: number; south: number; east: number; west: number },
  minZoom: number,
  maxZoom: number,
): number {
  let total = 0;
  for (let z = minZoom; z <= maxZoom; z++) {
    const nw = latLngToTile(bounds.north, bounds.west, z);
    const se = latLngToTile(bounds.south, bounds.east, z);
    const xMin = Math.min(nw.x, se.x);
    const xMax = Math.max(nw.x, se.x);
    const yMin = Math.min(nw.y, se.y);
    const yMax = Math.max(nw.y, se.y);
    total += (xMax - xMin + 1) * (yMax - yMin + 1);
  }
  return total;
}

export async function downloadArea(
  bounds: { north: number; south: number; east: number; west: number },
  minZoom: number,
  maxZoom: number,
  onProgress: (done: number, total: number) => void,
  _name?: string,
): Promise<number> {
  const urls: string[] = [];
  for (let z = minZoom; z <= maxZoom; z++) {
    const nw = latLngToTile(bounds.north, bounds.west, z);
    const se = latLngToTile(bounds.south, bounds.east, z);
    const xMin = Math.min(nw.x, se.x);
    const xMax = Math.max(nw.x, se.x);
    const yMin = Math.min(nw.y, se.y);
    const yMax = Math.max(nw.y, se.y);
    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        urls.push(getTileUrl(z, x, y));
      }
    }
  }

  const total = urls.length;
  let done = 0;

  // Download in batches of 8 concurrent requests
  const batchSize = 8;
  for (let i = 0; i < urls.length; i += batchSize) {
    const batch = urls.slice(i, i + batchSize);
    await Promise.allSettled(batch.map((url) => cacheTile(url)));
    done += batch.length;
    onProgress(Math.min(done, total), total);
  }

  return total;
}

export async function getCacheStats(): Promise<{
  tileCount: number;
  estimatedMB: number;
}> {
  try {
    const cache = await caches.open(TILE_CACHE_NAME);
    const keys = await cache.keys();
    const tileCount = keys.length;
    const estimatedMB = (tileCount * 15) / 1024; // ~15KB per tile
    return { tileCount, estimatedMB };
  } catch {
    return { tileCount: 0, estimatedMB: 0 };
  }
}

export async function clearTileCache(): Promise<void> {
  try {
    await caches.delete(TILE_CACHE_NAME);
  } catch {
    // no-op
  }
}

// --- Named download records ---

export interface MapDownloadRecord {
  id: string;
  name: string;
  date: number;
  tileCount: number;
  bounds: { north: number; south: number; east: number; west: number };
  minZoom: number;
  maxZoom: number;
}

const DOWNLOADS_KEY = "map-downloads-v1";

export function getMapDownloadRecords(): MapDownloadRecord[] {
  try {
    return JSON.parse(localStorage.getItem(DOWNLOADS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function saveMapDownloadRecord(record: MapDownloadRecord): void {
  const records = getMapDownloadRecords();
  records.unshift(record);
  localStorage.setItem(DOWNLOADS_KEY, JSON.stringify(records));
}

export function deleteMapDownloadRecord(id: string): void {
  const records = getMapDownloadRecords().filter((r) => r.id !== id);
  localStorage.setItem(DOWNLOADS_KEY, JSON.stringify(records));
}
