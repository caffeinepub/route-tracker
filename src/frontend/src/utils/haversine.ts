export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function totalDistance(
  points: Array<{ latitude: number; longitude: number }>,
): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineDistance(
      points[i - 1].latitude,
      points[i - 1].longitude,
      points[i].latitude,
      points[i].longitude,
    );
  }
  return total;
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(2)} km`;
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function formatSpeed(metersPerSecond: number): string {
  return `${(metersPerSecond * 3.6).toFixed(1)} km/h`;
}

/**
 * Minimum distance in meters from point (lat, lon) to segment (lat1,lon1)-(lat2,lon2).
 * Uses flat-earth approximation (fine for small distances).
 */
export function distanceToSegment(
  lat: number,
  lon: number,
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dlat = lat2 - lat1;
  const dlon = lon2 - lon1;
  const lenSq = dlat * dlat + dlon * dlon;

  if (lenSq === 0) {
    // Degenerate segment — both endpoints same
    return haversineDistance(lat, lon, lat1, lon1);
  }

  // Project point onto segment in lat/lon space, clamp to [0,1]
  let t = ((lat - lat1) * dlat + (lon - lon1) * dlon) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const closestLat = lat1 + t * dlat;
  const closestLon = lon1 + t * dlon;

  return haversineDistance(lat, lon, closestLat, closestLon);
}

/**
 * Minimum distance in meters from point (lat, lon) to any segment in a polyline.
 */
export function distanceToPolyline(
  lat: number,
  lon: number,
  waypoints: Array<{ latitude: number; longitude: number }>,
): number {
  if (waypoints.length < 2) {
    if (waypoints.length === 1) {
      return haversineDistance(
        lat,
        lon,
        waypoints[0].latitude,
        waypoints[0].longitude,
      );
    }
    return Number.POSITIVE_INFINITY;
  }

  let minDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const d = distanceToSegment(
      lat,
      lon,
      waypoints[i].latitude,
      waypoints[i].longitude,
      waypoints[i + 1].latitude,
      waypoints[i + 1].longitude,
    );
    if (d < minDist) minDist = d;
  }
  return minDist;
}
