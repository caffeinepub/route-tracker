# Route Tracker

## Current State
- Leaflet map with OpenStreetMap tiles (online only)
- GPS route recording with pause/resume/stop
- Routes saved to backend canister
- Follow route / deviation warning
- Settings: configurable deviation threshold
- Persistent locate button

## Requested Changes (Diff)

### Add
- **Offline map tile cache**: A "Download Area" button on the map that fetches and stores all visible map tiles (zoom levels 13–18) into the browser Cache API. Shows download progress and estimated tile count. Tiles are served from cache when offline.
- **Offline tile layer**: Custom Leaflet tile layer that intercepts tile requests and serves from Cache API when network is unavailable, falling back to network otherwise.
- **Offline route recording**: Routes recorded while offline are stored in IndexedDB. When the app comes back online, pending routes are auto-synced to the backend.
- **Connectivity indicator**: Small status badge on map showing "Offline" when device has no network connection.
- **Cached areas management**: In Settings sheet, show cache size and a clear cache button.
- **Pending routes sync**: In Routes tab, show pending/unsynced offline routes with a "Sync Now" button.

### Modify
- `MapView.tsx`: Add Download Area button, custom tile layer with cache fallback, offline status badge, integrate offline route saving when offline.
- `RoutesView.tsx`: Show pending/unsynced routes section with sync button.
- `App.tsx`: Add online/offline state, pass isOnline to components.
- Settings sheet: Add "Cached Map Areas" section with cache stats and clear option.

### Remove
- Nothing removed

## Implementation Plan
1. Create `src/frontend/src/utils/tileCache.ts` - Cache API helpers: cacheTile, checkCache, downloadArea (enumerate tiles for bounds + zoom range), getCacheStats, clearTileCache.
2. Create `src/frontend/src/utils/offlineRoutes.ts` - IndexedDB helpers: savePendingRoute, getPendingRoutes, deletePendingRoute.
3. Create `src/frontend/src/hooks/useOnlineStatus.ts` - React hook tracking navigator.onLine.
4. Modify `MapView.tsx`: custom tile layer checking Cache API first, Download Area button with progress dialog, offline status badge, offline route saving.
5. Modify `RoutesView.tsx`: load pending offline routes, show Pending Sync section, sync button.
6. Modify `App.tsx`: pass isOnline state.
7. Modify Settings sheet: cache stats + clear button.
