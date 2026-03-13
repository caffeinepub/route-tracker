# Route Tracker

## Current State
- Full-stack GPS route tracker with Motoko backend and React frontend
- Users can record GPS routes live on a Leaflet map with start/pause/stop controls
- Stats overlay shows distance, elapsed time, speed during recording
- Routes are saved to the backend with name, waypoints, distance, and timestamp
- Saved routes tab lists all routes; clicking one replays it on the map
- Export to GPX/KML is available per route in the saved list and from the stopped recording state

## Requested Changes (Diff)

### Add
- "Follow Route" mode: user can designate any saved route as an **active reference route**
- When recording with an active reference route, each new GPS position is compared against the closest point on the reference polyline
- If the distance from the current position to the nearest segment of the reference route exceeds 5 meters, show a persistent warning banner on the map
- Warning clears automatically when the user returns within 5 meters of the route
- Reference route is drawn in a distinct color (e.g. orange/amber) on the map to differentiate it from the live recording polyline (blue)
- "Set as Reference" button on each saved route card in RoutesView
- Active reference route indicator shown in RoutesView and MapView
- Option to clear the active reference route

### Modify
- `RoutesView`: add "Set as Reference" / "Active" toggle button per route card
- `MapView`: draw reference route polyline separately; add deviation check on each GPS update; show/hide warning overlay
- `App.tsx`: lift reference route state so both views can read/write it

### Remove
- Nothing removed

## Implementation Plan
1. Add `distanceToSegment` and `distanceToPolyline` helpers to `haversine.ts` for finding closest point on a multi-segment polyline
2. Lift `referenceRoute` state into `App.tsx` (or a context); pass setters down to `RoutesView` and `MapView`
3. In `RoutesView`, add a "Set as Reference" button per card; highlight the currently active reference card
4. In `MapView`, when `referenceRoute` is set, draw it as an amber polyline layer
5. In `MapView.addPosition`, when recording and a reference route is active, compute deviation; set `isDeviating` state
6. Render a warning banner (red/amber) when `isDeviating` is true and recording is active
