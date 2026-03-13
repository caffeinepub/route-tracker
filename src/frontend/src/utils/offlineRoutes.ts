import type { Coordinate } from "../backend.d";

export interface PendingRoute {
  id?: number;
  name: string;
  waypoints: Coordinate[];
  distance: number;
  timestamp: bigint;
}

const DB_NAME = "route-tracker-offline";
const STORE_NAME = "pending-routes";
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, {
          keyPath: "id",
          autoIncrement: true,
        });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

interface StoredRoute {
  id?: number;
  name: string;
  waypoints: Coordinate[];
  distance: number;
  timestamp: string; // bigint serialized as string
}

export async function savePendingRoute(
  route: Omit<PendingRoute, "id">,
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const stored: StoredRoute = {
      ...route,
      timestamp: route.timestamp.toString(),
    };
    const req = store.add(stored);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getPendingRoutes(): Promise<PendingRoute[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => {
      const results: StoredRoute[] = req.result;
      resolve(
        results.map((r) => ({
          ...r,
          timestamp: BigInt(r.timestamp),
        })),
      );
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deletePendingRoute(id: number): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function clearPendingRoutes(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
