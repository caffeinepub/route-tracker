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
  const kmlContent = buildKML(name, waypoints);
  triggerDownload(
    kmlContent,
    "application/vnd.google-earth.kml+xml",
    `${name}.kml`,
  );
}

export function exportKMZ(
  name: string,
  waypoints: { latitude: number; longitude: number }[],
): void {
  const kmlContent = buildKML(name, waypoints);
  const kmlBytes = new TextEncoder().encode(kmlContent);
  const zipBytes = buildZip("doc.kml", kmlBytes);
  const blob = new Blob([zipBytes.buffer as ArrayBuffer], {
    type: "application/vnd.google-earth.kmz",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}.kmz`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function buildKML(
  name: string,
  waypoints: { latitude: number; longitude: number }[],
): string {
  const coordinates = waypoints
    .map((w) => `${w.longitude},${w.latitude},0`)
    .join(" ");
  const nl = "\n";
  return [
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

function buildZip(filename: string, data: Uint8Array): Uint8Array {
  const enc = new TextEncoder();
  const nameBytes = enc.encode(filename);
  const nameLen = nameBytes.length;
  const dataLen = data.length;
  const crc = crc32(data);

  const lfh = new Uint8Array(30 + nameLen);
  const lfhView = new DataView(lfh.buffer);
  lfhView.setUint32(0, 0x04034b50, true);
  lfhView.setUint16(4, 20, true);
  lfhView.setUint16(6, 0, true);
  lfhView.setUint16(8, 0, true);
  lfhView.setUint16(10, 0, true);
  lfhView.setUint16(12, 0, true);
  lfhView.setUint32(14, crc, true);
  lfhView.setUint32(18, dataLen, true);
  lfhView.setUint32(22, dataLen, true);
  lfhView.setUint16(26, nameLen, true);
  lfhView.setUint16(28, 0, true);
  lfh.set(nameBytes, 30);

  const cdh = new Uint8Array(46 + nameLen);
  const cdhView = new DataView(cdh.buffer);
  cdhView.setUint32(0, 0x02014b50, true);
  cdhView.setUint16(4, 20, true);
  cdhView.setUint16(6, 20, true);
  cdhView.setUint16(8, 0, true);
  cdhView.setUint16(10, 0, true);
  cdhView.setUint16(12, 0, true);
  cdhView.setUint16(14, 0, true);
  cdhView.setUint32(16, crc, true);
  cdhView.setUint32(20, dataLen, true);
  cdhView.setUint32(24, dataLen, true);
  cdhView.setUint16(28, nameLen, true);
  cdhView.setUint16(30, 0, true);
  cdhView.setUint16(32, 0, true);
  cdhView.setUint16(34, 0, true);
  cdhView.setUint16(36, 0, true);
  cdhView.setUint32(38, 0, true);
  cdhView.setUint32(42, 0, true);
  cdh.set(nameBytes, 46);

  const cdOffset = lfh.length + dataLen;
  const cdSize = cdh.length;

  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(4, 0, true);
  eocdView.setUint16(6, 0, true);
  eocdView.setUint16(8, 1, true);
  eocdView.setUint16(10, 1, true);
  eocdView.setUint32(12, cdSize, true);
  eocdView.setUint32(16, cdOffset, true);
  eocdView.setUint16(20, 0, true);

  const total = new Uint8Array(lfh.length + dataLen + cdh.length + eocd.length);
  let offset = 0;
  total.set(lfh, offset);
  offset += lfh.length;
  total.set(data, offset);
  offset += dataLen;
  total.set(cdh, offset);
  offset += cdh.length;
  total.set(eocd, offset);
  return total;
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
