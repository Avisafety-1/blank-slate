import JSZip from "jszip";
import { sanitizeFilename } from "@/lib/kmzExport";

interface TrackPosition {
  lat: number;
  lng: number;
  alt?: number;
  height?: number;
  timestamp?: string | number;
}

interface FlightTrack {
  positions?: TrackPosition[];
}

const escapeXml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

const toIso = (t: TrackPosition["timestamp"]): string | null => {
  if (t == null) return null;
  try {
    const d = typeof t === "number" ? new Date(t) : new Date(t);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  } catch {
    return null;
  }
};

const validPositions = (track: FlightTrack): TrackPosition[] =>
  (track?.positions || []).filter(
    (p) => typeof p?.lat === "number" && typeof p?.lng === "number" && isFinite(p.lat) && isFinite(p.lng)
  );

export function buildGpxFromTrack(track: FlightTrack, name: string): string {
  const positions = validPositions(track);
  const safeName = escapeXml(name);
  const trkpts = positions
    .map((p) => {
      const ele = p.alt ?? p.height;
      const time = toIso(p.timestamp);
      const parts: string[] = [];
      if (ele != null && isFinite(ele as number)) parts.push(`        <ele>${ele}</ele>`);
      if (time) parts.push(`        <time>${time}</time>`);
      return `      <trkpt lat="${p.lat}" lon="${p.lng}">${parts.length ? "\n" + parts.join("\n") + "\n      " : ""}</trkpt>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Avisafe" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>${safeName}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>
`;
}

export function buildKmlFromTrack(track: FlightTrack, name: string): string {
  const positions = validPositions(track);
  const safeName = escapeXml(name);
  const coords = positions
    .map((p) => {
      const ele = p.alt ?? p.height ?? 0;
      return `${p.lng},${p.lat},${ele}`;
    })
    .join(" ");
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${safeName}</name>
    <Placemark>
      <name>${safeName}</name>
      <LineString>
        <tessellate>1</tessellate>
        <altitudeMode>absolute</altitudeMode>
        <coordinates>${coords}</coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>
`;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadGpx(track: FlightTrack, baseName: string) {
  const gpx = buildGpxFromTrack(track, baseName);
  const blob = new Blob([gpx], { type: "application/gpx+xml" });
  triggerDownload(blob, `${sanitizeFilename(baseName)}.gpx`);
}

export async function downloadKmz(track: FlightTrack, baseName: string) {
  const kml = buildKmlFromTrack(track, baseName);
  const zip = new JSZip();
  zip.file("doc.kml", kml);
  const blob = await zip.generateAsync({ type: "blob", mimeType: "application/vnd.google-earth.kmz" });
  triggerDownload(blob, `${sanitizeFilename(baseName)}.kmz`);
}
