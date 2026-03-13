export function exportGPX(
  name: string,
  waypoints: { latitude: number; longitude: number }[],
): void {
  const nl = "\n";
  const trkpts = waypoints
    .map((w) => `      <trkpt lat="${w.latitude}" lon="${w.longitude}"/>`)
    .join(nl);

  const gpx = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="Route Tracker" xmlns="http://www.topografix.com/GPX/1/1">',
    "  <trk>",
    `    <name>${escapeXml(name)}</name>`,
    "    <trkseg>",
    trkpts,
    "    </trkseg>",
    "  </trk>",
    "</gpx>",
  ].join(nl);

  triggerDownload(gpx, "application/gpx+xml", `${name}.gpx`);
}

export function exportKML(
  name: string,
  waypoints: { latitude: number; longitude: number }[],
): void {
  const coordinates = waypoints
    .map((w) => `${w.longitude},${w.latitude},0`)
    .join(" ");

  const nl = "\n";
  const kml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<kml xmlns="http://www.opengis.net/kml/2.2">',
    "  <Placemark>",
    `    <name>${escapeXml(name)}</name>`,
    "    <LineString>",
    `      <coordinates>${coordinates}</coordinates>`,
    "    </LineString>",
    "  </Placemark>",
    "</kml>",
  ].join(nl);

  triggerDownload(kml, "application/vnd.google-earth.kml+xml", `${name}.kml`);
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function triggerDownload(
  content: string,
  mimeType: string,
  filename: string,
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
