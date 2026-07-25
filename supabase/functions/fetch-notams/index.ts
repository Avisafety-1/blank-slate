import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PANSA_DRONEMAP_PUBLIC_API_KEY = Deno.env.get("PANSA_DRONEMAP_PUBLIC_API_KEY")
  ?? "4b705300-8dfa-11ee-b9d1-0242ac120002";

let pansaCaCertPromise: Promise<string> | null = null;

async function getPansaCaCert(): Promise<string> {
  pansaCaCertPromise ??= fetch("https://certs.godaddy.com/repository/gdig2.crt.pem")
    .then((res) => {
      if (!res.ok) throw new Error(`Could not load GoDaddy intermediate CA [${res.status}]`);
      return res.text();
    });
  return pansaCaCertPromise;
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const combined = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }
  return combined;
}

function findHeaderEnd(bytes: Uint8Array): number {
  for (let i = 0; i < bytes.length - 3; i++) {
    if (bytes[i] === 13 && bytes[i + 1] === 10 && bytes[i + 2] === 13 && bytes[i + 3] === 10) {
      return i;
    }
  }
  return -1;
}

function indexOfCrlf(bytes: Uint8Array, start: number): number {
  for (let i = start; i < bytes.length - 1; i++) {
    if (bytes[i] === 13 && bytes[i + 1] === 10) return i;
  }
  return -1;
}

function decodeChunkedBytes(bytes: Uint8Array): Uint8Array {
  let cursor = 0;
  const decoded: Uint8Array[] = [];
  while (cursor < bytes.length) {
    const lineEnd = indexOfCrlf(bytes, cursor);
    if (lineEnd < 0) break;
    const sizeLine = new TextDecoder().decode(bytes.slice(cursor, lineEnd));
    const size = parseInt(sizeLine.split(";")[0], 16);
    if (!Number.isFinite(size) || size <= 0) break;
    const chunkStart = lineEnd + 2;
    decoded.push(bytes.slice(chunkStart, chunkStart + size));
    cursor = chunkStart + size + 2;
  }
  return concatBytes(decoded);
}

async function pansaDronemapRequest(path: string, accessToken?: string): Promise<unknown> {
  const caCert = await getPansaCaCert();
  const conn = await Deno.connectTls({
    hostname: "api.dronemap.pansa.pl",
    port: 443,
    caCerts: [caCert],
  });

  const headers = [
    `${accessToken ? "GET" : "POST"} ${path} HTTP/1.1`,
    "Host: api.dronemap.pansa.pl",
    "Connection: close",
    "Accept: application/json, text/plain, */*",
    "Accept-Encoding: identity",
    "Content-Type: application/json",
    "User-Agent: Avisafe/1.0 (+https://avisafe.no)",
    "Origin: https://dronemap.pansa.pl",
    "Referer: https://dronemap.pansa.pl/",
    `x-api-key: ${PANSA_DRONEMAP_PUBLIC_API_KEY}`,
    ...(accessToken ? [`Authorization: Bearer ${accessToken}`] : []),
    "Content-Length: 0",
    "",
    "",
  ].join("\r\n");

  await conn.write(new TextEncoder().encode(headers));
  const chunks: Uint8Array[] = [];
  const buffer = new Uint8Array(65536);
  try {
    while (true) {
      const bytesRead = await conn.read(buffer);
      if (bytesRead === null) break;
      chunks.push(buffer.slice(0, bytesRead));
    }
  } finally {
    try { conn.close(); } catch { /* ignore close errors */ }
  }

  const responseBytes = concatBytes(chunks);
  const headerEnd = findHeaderEnd(responseBytes);
  if (headerEnd < 0) throw new Error("PANSA DroneMap returned an invalid HTTP response");

  const headerText = new TextDecoder().decode(responseBytes.slice(0, headerEnd));
  const bodyBytes = responseBytes.slice(headerEnd + 4);
  const status = Number(headerText.match(/^HTTP\/\d\.\d\s+(\d+)/)?.[1] ?? 0);
  const isChunked = /transfer-encoding:\s*chunked/i.test(headerText);
  const payloadBytes = isChunked ? decodeChunkedBytes(bodyBytes) : bodyBytes;
  const body = new TextDecoder().decode(payloadBytes);

  if (status < 200 || status >= 300) {
    throw new Error(`PANSA DroneMap request failed [${status}]: ${body.slice(0, 300)}`);
  }
  return JSON.parse(body);
}

/** Parse DMS coordinates from NOTAM text for polygon geometry */
function parseNotamCoordinates(text: string | null | undefined): object | null {
  if (!text) return null;
  const regex = /(\d{2})(\d{2})(\d{2})([NS])\s*(\d{3})(\d{2})(\d{2})([EW])/g;
  const coords: [number, number][] = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    const latDeg = parseInt(match[1]);
    const latMin = parseInt(match[2]);
    const latSec = parseInt(match[3]);
    const latDir = match[4];
    const lngDeg = parseInt(match[5]);
    const lngMin = parseInt(match[6]);
    const lngSec = parseInt(match[7]);
    const lngDir = match[8];
    let lat = latDeg + latMin / 60 + latSec / 3600;
    if (latDir === "S") lat = -lat;
    let lng = lngDeg + lngMin / 60 + lngSec / 3600;
    if (lngDir === "W") lng = -lng;
    coords.push([lng, lat]);
  }
  if (coords.length < 3) return null;
  const first = coords[0];
  const last = coords[coords.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    coords.push([...first] as [number, number]);
  }
  return { type: "Polygon", coordinates: [coords] };
}

/** Parse Q-line center coordinate like 5812N00707E or with radius 5812N00707E014 */
function parseQlineCenter(qline: string): { lat: number; lng: number; radiusNm: number | null } | null {
  // Format: DDMMN DDDMME or DDMMNDDDMME with optional 3-digit radius
  const match = qline.match(/(\d{2})(\d{2})([NS])(\d{3})(\d{2})([EW])(\d{3})?/);
  if (!match) return null;
  let lat = parseInt(match[1]) + parseInt(match[2]) / 60;
  if (match[3] === "S") lat = -lat;
  let lng = parseInt(match[4]) + parseInt(match[5]) / 60;
  if (match[6] === "W") lng = -lng;
  const radiusNm = match[7] ? parseInt(match[7]) : null;
  return { lat, lng, radiusNm };
}

/** Create a circle polygon from center+radius for NOTAMs without polygon coords.
 *  Returns null if radius exceeds MAX_CIRCLE_NM (FIR-level NOTAMs). */
const MAX_CIRCLE_NM = 25;

function createCirclePolygon(lat: number, lng: number, radiusNm: number): object | null {
  if (radiusNm > MAX_CIRCLE_NM) return null; // Skip huge FIR-level circles
  const radiusKm = radiusNm * 1.852;
  const radiusDeg = radiusKm / 111.32;
  const points: [number, number][] = [];
  for (let i = 0; i <= 32; i++) {
    const angle = (i / 32) * 2 * Math.PI;
    const dlat = radiusDeg * Math.cos(angle);
    const dlng = radiusDeg * Math.sin(angle) / Math.cos(lat * Math.PI / 180);
    points.push([lng + dlng, lat + dlat]);
  }
  return { type: "Polygon", coordinates: [points] };
}

/** Parse RSS date strings like "11 Apr 2026 06:30 GMT" */
function parseRssDate(dateStr: string): string | null {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  } catch {
    return null;
  }
}

/** Parse an RSS item description to extract NOTAM fields */
function parseRssItem(title: string, description: string, guid: string) {
  // Extract NOTAM ID from title like "A2518/26: ..."
  const idMatch = title.match(/^([A-Z])(\d+)\/(\d{2}):/);
  const series = idMatch ? idMatch[1] : null;
  const number = idMatch ? parseInt(idMatch[2]) : 0;
  const year = idMatch ? 2000 + parseInt(idMatch[3]) : 0;
  const notamId = idMatch ? `${series}${number}/${idMatch[3]}` : guid;

  // Clean HTML from description
  const cleanDesc = description
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?pre>/gi, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

  // Extract Q-line (first line, format: ENOR/QWULW/IV/BO/W/000/015/5812N00707E014)
  const qlineMatch = cleanDesc.match(/^([A-Z]{4}\/Q[^\n]+)/m);
  const qline = qlineMatch ? qlineMatch[1] : null;

  // Extract location from Q-line
  const location = qline ? qline.substring(0, 4) : null;

  // Extract Q-code and scope from Q-line segments
  // Format: FIR/Qcode/Traffic/Purpose/Scope/Lower/Upper/Coords
  const qlineSegments = qline?.split("/") ?? [];
  const qcodeMatch = qline?.match(/\/(Q[A-Z]+)\//);
  const qcode = qcodeMatch ? qcodeMatch[1] : null;
  const scope = qlineSegments.length >= 5 ? qlineSegments[4] : null;

  // Parse center from Q-line
  let centerLat: number | null = null;
  let centerLng: number | null = null;
  let radiusNm: number | null = null;
  if (qline) {
    const center = parseQlineCenter(qline);
    if (center) {
      centerLat = center.lat;
      centerLng = center.lng;
      radiusNm = center.radiusNm;
    }
  }

  // Extract NOTAM text (between Q-line and LOWER/UPPER)
  const textMatch = cleanDesc.match(/(?:^[A-Z]{4}\/Q[^\n]+\n+)?([\s\S]*?)(?:\nLOWER:|$)/);
  const notamText = textMatch ? textMatch[1].trim() : cleanDesc;

  // Extract altitudes
  const lowerMatch = cleanDesc.match(/LOWER:\s*(.+)/);
  const upperMatch = cleanDesc.match(/UPPER:\s*(.+)/);
  
  // Parse FL from altitude strings
  const parseFL = (alt: string | undefined): number | null => {
    if (!alt) return null;
    const flMatch = alt.match(/FL\s*(\d+)/i);
    if (flMatch) return parseInt(flMatch[1]);
    const ftMatch = alt.match(/([\d,]+)\s*Feet\s*(AMSL|AGL)?/i);
    if (ftMatch) return Math.round(parseInt(ftMatch[1].replace(/,/g, "")) / 100);
    if (/GND|SFC/i.test(alt)) return 0;
    return null;
  };

  const minimumFL = parseFL(lowerMatch?.[1]);
  const maximumFL = parseFL(upperMatch?.[1]);

  // Extract FROM/TO dates
  const fromMatch = cleanDesc.match(/FROM:\s*(\d{1,2}\s+\w+\s+\d{4}\s+\d{2}:\d{2}\s+GMT)/);
  const toMatch = cleanDesc.match(/TO:\s*(\d{1,2}\s+\w+\s+\d{4}\s+\d{2}:\d{2}\s+GMT)/);
  const effectiveStart = fromMatch ? parseRssDate(fromMatch[1]) : null;
  const effectiveEnd = toMatch ? parseRssDate(toMatch[1]) : null;

  // Check for PERM — must NOT match "PERMISSION"/"PERMITTED" etc., and only valid if no TO-date present
  const isPerm = !toMatch && /\bPERM\b(?!I)/i.test(cleanDesc);
  const effectiveEndInterpretation = isPerm ? "PERM" : (effectiveEnd ? null : "EST");

  // Parse polygon from text coordinates
  const parsedPolygon = parseNotamCoordinates(notamText);
  
  // If no polygon but we have center+radius, create circle
  // Skip circle for aerodrome (scope "A") NOTAMs — show as pin instead
  let geometryGeojson = parsedPolygon;
  if (!geometryGeojson && centerLat && centerLng && radiusNm && radiusNm > 0 && scope !== "A") {
    geometryGeojson = createCirclePolygon(centerLat, centerLng, radiusNm);
  }

  return {
    notam_id: notamId,
    series,
    number,
    year,
    location,
    country_code: "NOR",
    qcode,
    scope,
    traffic: null,
    purpose: null,
    notam_type: null,
    notam_text: notamText,
    effective_start: effectiveStart,
    effective_end: effectiveEnd,
    effective_end_interpretation: effectiveEndInterpretation,
    minimum_fl: minimumFL,
    maximum_fl: maximumFL,
    center_lat: centerLat,
    center_lng: centerLng,
    geometry_geojson: geometryGeojson,
    properties: { guid, qline, source: "notaminfo" },
  };
}

/** Look up precise CAA fareområde geometry for NOTAMs that reference ENDxxx codes. */
function enrichGeometryFromCAA(
  item: ReturnType<typeof parseRssItem>,
  caaMap: Map<string, unknown>,
): ReturnType<typeof parseRssItem> {
  const text = item.notam_text ?? "";
  // Tolerate stray whitespace/dash inside the code (e.g. "EN D354", "END 354")
  const codeRegex = /\bEN[\s\-]?[DR][\s\-]?\d{3}[A-Z]?\b/g;
  const rawCodes = text.match(codeRegex) ?? [];
  const codes = Array.from(new Set(rawCodes.map((c) => c.replace(/[\s\-]/g, "").toUpperCase())));
  for (const code of codes) {
    const exact = caaMap.get(code);
    const stripped = code.replace(/[A-Z]$/, "");
    const fallback = exact ?? (stripped !== code ? caaMap.get(stripped) : undefined);
    if (fallback) {
      return {
        ...item,
        geometry_geojson: fallback as object,
        properties: {
          ...(item.properties as Record<string, unknown>),
          geometry_source: "caa-fareomrader",
          matched_caa_id: exact ? code : stripped,
        },
      };
    }
  }
  return item;
}

/** Fetch and parse a single RSS feed */
async function fetchRssFeed(feedUrl: string): Promise<ReturnType<typeof parseRssItem>[]> {
  const res = await fetch(feedUrl, {
    headers: { Accept: "application/rss+xml, application/xml, text/xml" },
  });
  if (!res.ok) {
    console.error(`RSS fetch error [${res.status}] for ${feedUrl}`);
    return [];
  }
  const xml = await res.text();

  // Simple XML parser for RSS items
  const items: ReturnType<typeof parseRssItem>[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let itemMatch;
  while ((itemMatch = itemRegex.exec(xml)) !== null) {
    const itemXml = itemMatch[1];
    const getTag = (tag: string) => {
      const m = itemXml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)(?:<\\/${tag}>|$)`, "i"));
      return m ? m[1].trim() : "";
    };
    const title = getTag("title");
    const description = getTag("description");
    const guid = getTag("guid");

    if (title) {
      items.push(parseRssItem(title, description, guid));
    }
  }
  return items;
}

function hashToPositiveInt(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) || 1;
}

function parsePansaSeries(raw: string | null | undefined, fallbackId: string) {
  const value = raw ?? "";
  const standard = value.match(/^([A-Z])(\d+)\/(\d{2})/);
  if (standard) {
    return {
      series: standard[1],
      number: parseInt(standard[2]),
      year: 2000 + parseInt(standard[3]),
    };
  }

  const droneZone = value.match(/^(\d+)([A-Z]+)\/(\d{2})/);
  if (droneZone) {
    return {
      series: droneZone[2],
      number: parseInt(droneZone[1]),
      year: 2000 + parseInt(droneZone[3]),
    };
  }

  return {
    series: null,
    number: hashToPositiveInt(fallbackId),
    year: new Date().getUTCFullYear(),
  };
}

function parsePansaNotam(raw: Record<string, any>): ReturnType<typeof parseRssItem> | null {
  const uid = String(raw.uid ?? raw.series ?? "");
  if (!uid) return null;

  const q = raw.q ?? {};
  const qline = q.fir
    ? `${q.fir}/${q.code ?? ""}/${q.traffic ?? ""}/${q.purpose ?? ""}/${q.scope ?? ""}/${q.lower ?? ""}/${q.upper ?? ""}/${q.coords ?? ""}`
    : null;

  const parsedSeries = parsePansaSeries(raw.seriesref ?? raw.series, uid);
  const center = q.coords ? parseQlineCenter(String(q.coords)) : null;
  const description = typeof raw.description === "object" && raw.description !== null
    ? (raw.description.en ?? raw.description.pl ?? null)
    : raw.description;
  const text = String(description ?? raw.e ?? raw.zonename ?? raw.series ?? "").trim();

  let geometryGeojson: object | null = parseNotamCoordinates(`${raw.e ?? ""}\n${text}`);
  if (!geometryGeojson && center?.lat && center?.lng && center.radiusNm && center.radiusNm > 0 && q.scope !== "A") {
    geometryGeojson = createCirclePolygon(center.lat, center.lng, center.radiusNm);
  }

  const effectiveStart = raw.b ? new Date(raw.b).toISOString() : null;
  const effectiveEnd = raw.c ? new Date(raw.c).toISOString() : null;

  return {
    notam_id: `PANSA:${uid}`,
    series: parsedSeries.series,
    number: parsedSeries.number,
    year: parsedSeries.year,
    location: raw.a ?? q.fir ?? "EPWW",
    country_code: "POL",
    qcode: q.code ?? null,
    scope: q.scope ?? null,
    traffic: q.traffic ?? null,
    purpose: q.purpose ?? null,
    notam_type: raw.type ?? null,
    notam_text: text,
    effective_start: effectiveStart,
    effective_end: effectiveEnd,
    effective_end_interpretation: null,
    minimum_fl: q.lower ? parseInt(q.lower) : null,
    maximum_fl: q.upper ? parseInt(q.upper) : null,
    center_lat: center?.lat ?? null,
    center_lng: center?.lng ?? null,
    geometry_geojson: geometryGeojson,
    properties: {
      qline,
      source: "pansa-dronemap",
      uid,
      raw_series: raw.series ?? null,
      seriesref: raw.seriesref ?? null,
      zonename: raw.zonename ?? null,
      active: raw.active ?? null,
      schedule: raw.d ?? null,
    },
  };
}

async function fetchPansaDronemapNotams(feedUrl: string): Promise<ReturnType<typeof parseRssItem>[]> {
  const loginJson = await pansaDronemapRequest("/v1/front/login") as Record<string, any>;
  const accessToken = loginJson.access_token;
  if (!accessToken) throw new Error("PANSA DroneMap login did not return an access token");

  const url = new URL(feedUrl || "https://api.dronemap.pansa.pl/v1/notams");
  const notamsJson = await pansaDronemapRequest(`${url.pathname}${url.search}`, accessToken) as Record<string, any>;
  const properties = Array.isArray(notamsJson?.properties) ? notamsJson.properties : [];
  return properties
    .filter((item: Record<string, any>) => item.active !== false)
    .map(parsePansaNotam)
    .filter((item): item is ReturnType<typeof parseRssItem> => Boolean(item));
}

/** Parse ICAO briefing date "26/07/02 15:56" (YY/MM/DD HH:MM UTC) → ISO */
function parseBriefingDate(raw: string): string | null {
  const m = raw.match(/(\d{2})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})/);
  if (!m) return null;
  const yy = 2000 + parseInt(m[1]);
  const iso = `${yy}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00Z`;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/** Parse a single raw NOTAM block from a notaminfo /latest?country=X briefing.
 *  Block format:
 *    A1234/26
 *    Q) ENOR/QSPAH/IV/BO/E/000/155/5921N00956E061
 *    A) ENOR  B) FROM: 26/06/20 00:00  TO: 26/08/09 23:59 [EST|PERM]
 *    E) <text spanning multiple lines>
 *    [F) <lower alt>]  [G) <upper alt>]
 */
function parseBriefingBlock(block: string, countryLabel: string): ReturnType<typeof parseRssItem> | null {
  // NOTAM ID (must be present)
  const idMatch = block.match(/^\s*([A-Z])(\d+)\/(\d{2})\s*$/m);
  if (!idMatch) return null;
  const series = idMatch[1];
  const number = parseInt(idMatch[2]);
  const yy = idMatch[3];
  const year = 2000 + parseInt(yy);
  const notamId = `${series}${number}/${yy}`;

  // Q-line
  const qlineMatch = block.match(/Q\)\s*([A-Z]{4}\/Q[^\s\n]+)/);
  const qline = qlineMatch ? qlineMatch[1] : null;
  const qlineSegments = qline?.split("/") ?? [];
  const location = qline ? qline.substring(0, 4) : null;
  const qcode = qlineSegments[1] ?? null; // "QSPAH"
  const scope = qlineSegments.length >= 5 ? qlineSegments[4] : null;

  // Lower/upper FL from Q-line segments 5 & 6 ("000"/"155" = FL 0-155)
  const parseFLSeg = (s: string | undefined) => {
    if (!s) return null;
    const n = parseInt(s);
    return isNaN(n) ? null : n;
  };
  const minimumFL = parseFLSeg(qlineSegments[5]);
  const maximumFL = parseFLSeg(qlineSegments[6]);

  // Q-line center + radius
  let centerLat: number | null = null;
  let centerLng: number | null = null;
  let radiusNm: number | null = null;
  if (qline) {
    const c = parseQlineCenter(qline);
    if (c) { centerLat = c.lat; centerLng = c.lng; radiusNm = c.radiusNm; }
  }

  // B) FROM / TO
  const fromMatch = block.match(/B\)\s*FROM:\s*(\d{2}\/\d{2}\/\d{2}\s+\d{2}:\d{2})/);
  const toMatch = block.match(/TO:\s*(\d{2}\/\d{2}\/\d{2}\s+\d{2}:\d{2})(\s+(EST|PERM))?/);
  const effectiveStart = fromMatch ? parseBriefingDate(fromMatch[1]) : null;
  const effectiveEnd = toMatch ? parseBriefingDate(toMatch[1]) : null;
  const toSuffix = toMatch?.[3];
  const effectiveEndInterpretation = toSuffix === "PERM" ? "PERM" : (toSuffix === "EST" ? "EST" : null);

  // E) text (up to F/G/next NOTAM/end)
  const eMatch = block.match(/E\)\s*([\s\S]*?)(?:\n\s*[FG]\)|$)/);
  const notamText = eMatch ? eMatch[1].trim().replace(/\s+/g, " ") : block.trim();

  // Geometry: DMS in E-text takes priority; else circle from Q-line if radius sane
  let geometryGeojson: object | null = parseNotamCoordinates(notamText);
  if (!geometryGeojson && centerLat && centerLng && radiusNm && radiusNm > 0 && scope !== "A") {
    geometryGeojson = createCirclePolygon(centerLat, centerLng, radiusNm);
  }

  // Map country to ISO3 for country_code column
  const countryToIso3: Record<string, string> = {
    Austria: "AUT", Belgium: "BEL", Denmark: "DNK", France: "FRA", Germany: "DEU",
    Iceland: "ISL", Ireland: "IRL", Italy: "ITA", Netherlands: "NLD", Norway: "NOR",
    Poland: "POL", Portugal: "PRT", Spain: "ESP", Sweden: "SWE", Switzerland: "CHE", UK: "GBR",
  };


  return {
    notam_id: notamId,
    series,
    number,
    year,
    location,
    country_code: countryToIso3[countryLabel] ?? null,
    qcode,
    scope,
    traffic: null,
    purpose: null,
    notam_type: null,
    notam_text: notamText,
    effective_start: effectiveStart,
    effective_end: effectiveEnd,
    effective_end_interpretation: effectiveEndInterpretation,
    minimum_fl: minimumFL,
    maximum_fl: maximumFL,
    center_lat: centerLat,
    center_lng: centerLng,
    geometry_geojson: geometryGeojson,
    properties: { qline, source: "notaminfo-briefing", country: countryLabel },
  };
}

/** Fetch and parse a notaminfo per-country briefing page. */
async function fetchCountryBriefing(feedUrl: string, countryLabel: string): Promise<ReturnType<typeof parseRssItem>[]> {
  const res = await fetch(feedUrl, {
    headers: { Accept: "text/html", "User-Agent": "Avisafe/1.0 (+https://avisafe.no)" },
  });
  if (!res.ok) {
    console.error(`Country briefing fetch error [${res.status}] for ${feedUrl}`);
    return [];
  }
  const html = await res.text();
  // Strip HTML tags → plain text, decode entities we care about
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\r/g, "");

  const expectedBriefingCountry: Record<string, string> = {
    Austria: "AUSTRIA", Belgium: "BELGIUM", Denmark: "DENMARK", France: "FRANCE", Germany: "GERMANY",
    Iceland: "ICELAND", Ireland: "IRELAND", Italy: "ITALY", Netherlands: "NETHERLANDS", Norway: "NORWAY",
    Poland: "POLAND", Portugal: "PORTUGAL", Spain: "SPAIN", Sweden: "SWEDEN", Switzerland: "SWITZERLAND", UK: "UNITED KINGDOM",
  };
  const actualCountryMatch = text.match(/Pre-flight Information Bulletin for\s+([A-Z ]+)/i);
  const actualCountry = actualCountryMatch?.[1]?.trim().toUpperCase();
  const expectedCountry = expectedBriefingCountry[countryLabel]?.toUpperCase();
  if (actualCountry && expectedCountry && actualCountry !== expectedCountry) {
    throw new Error(`notaminfo country fallback detected: requested ${countryLabel}, received ${actualCountry}`);
  }

  // Split into blocks on NOTAM ID lines (e.g. "A1144/26"). We look for lines that are
  // just an ID and use their positions as block boundaries.
  const idLineRegex = /^\s*([A-Z]\d+\/\d{2})\s*$/gm;
  const positions: number[] = [];
  let m;
  while ((m = idLineRegex.exec(text)) !== null) positions.push(m.index);
  positions.push(text.length);

  const items: ReturnType<typeof parseRssItem>[] = [];
  for (let i = 0; i < positions.length - 1; i++) {
    const block = text.slice(positions[i], positions[i + 1]);
    // Must contain a Q-line to be a valid NOTAM block
    if (!/Q\)\s*[A-Z]{4}\/Q/.test(block)) continue;
    const item = parseBriefingBlock(block, countryLabel);
    if (item) items.push(item);
  }
  return items;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const now = new Date();
    let totalUpserted = 0;
    let totalSkipped = 0;
    let totalCaaEnriched = 0;

    // Load CAA polygons (fareområder + restriksjoner) once for geometry enrichment
    const caaMap = new Map<string, unknown>();
    for (const layer of ["fareomrader", "restriksjoner"]) {
      const { data: caaRows, error: caaErr } = await supabase
        .rpc("get_caa_zones_geojson", { p_layer_id: layer });
      if (caaErr) console.error(`CAA load error [${layer}]:`, caaErr);
      for (const row of caaRows ?? []) {
        if (row.external_id && row.geometry_geojson && !caaMap.has(row.external_id)) {
          caaMap.set(row.external_id, row.geometry_geojson);
        }
      }
    }
    console.log(`Loaded ${caaMap.size} CAA zones for NOTAM geometry enrichment`);

    // ── Step 1: Fetch enabled feeds (RSS + notaminfo per-country briefings) ──
    const { data: feeds } = await supabase
      .from("notam_rss_feeds")
      .select("id, name, feed_url, source_type, country")
      .eq("enabled", true);

    if (feeds && feeds.length > 0) {
      console.log(`Fetching NOTAMs from ${feeds.length} feed(s)...`);
      const feedResults: { name: string; count: number }[] = [];

      for (const feed of feeds) {
        try {
          const items = feed.source_type === "country_briefing"
            ? await fetchCountryBriefing(feed.feed_url, feed.country ?? "")
            : feed.source_type === "pansa_dronemap"
              ? await fetchPansaDronemapNotams(feed.feed_url)
              : await fetchRssFeed(feed.feed_url);
          if (items.length === 0) {
            // Record sync state even when empty
            await supabase.from("notam_rss_feeds").update({
              last_synced_at: now.toISOString(), last_upserted_count: 0, last_error: null,
            }).eq("id", feed.id);
            feedResults.push({ name: feed.name, count: 0 });
            continue;
          }

          // Filter expired
          const rows = items
            .filter((item) => {
              if (!item.effective_end) return true;
              const end = new Date(item.effective_end);
              if (end < now && item.effective_end_interpretation !== "PERM" && item.effective_end_interpretation !== "EST") {
                totalSkipped++;
                return false;
              }
              return true;
            })
            .map((item) => {
              const enriched = enrichGeometryFromCAA(item, caaMap);
              if ((enriched.properties as any)?.geometry_source === "caa-fareomrader") {
                totalCaaEnriched++;
              }
              return { ...enriched, fetched_at: now.toISOString() };
            });

          // Upsert in batches
          for (let i = 0; i < rows.length; i += 50) {
            const batch = rows.slice(i, i + 50);
            const { error } = await supabase
              .from("notams")
              .upsert(batch, { onConflict: "notam_id" });
            if (error) {
              console.error(`Upsert error for feed "${feed.name}":`, error);
            } else {
              totalUpserted += batch.length;
            }
          }

          await supabase.from("notam_rss_feeds").update({
            last_synced_at: now.toISOString(), last_upserted_count: rows.length, last_error: null,
          }).eq("id", feed.id);
          feedResults.push({ name: feed.name, count: rows.length });
        } catch (feedErr) {
          console.error(`Error processing feed "${feed.name}":`, feedErr);
          await supabase.from("notam_rss_feeds").update({
            last_synced_at: now.toISOString(), last_error: String(feedErr).slice(0, 500),
          }).eq("id", feed.id);
          feedResults.push({ name: feed.name, count: -1 });
        }
      }
      console.log("RSS feed results:", JSON.stringify(feedResults));
    } else {
      console.warn("No enabled RSS feeds configured in notam_rss_feeds table");
    }

    // ── Step 2: Clean up expired NOTAMs ──
    // Any NOTAM with a concrete effective_end in the past is removed,
    // regardless of interpretation (PERM with a past end-date is a contradiction
    // and usually a parser false-positive on words like "PERMISSION").
    const { count: deleteCount } = await supabase
      .from("notams")
      .delete({ count: "exact" })
      .lt("effective_end", now.toISOString());

    const staleDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    await supabase
      .from("notams")
      .delete()
      .is("effective_end", null)
      .lt("fetched_at", staleDate.toISOString());

    console.log(`NOTAMs: upserted=${totalUpserted}, skipped=${totalSkipped}, deleted=${deleteCount || 0}, caa_enriched=${totalCaaEnriched}`);

    return new Response(JSON.stringify({
      source: "RSS",
      upserted: totalUpserted,
      skipped: totalSkipped,
      deleted: deleteCount || 0,
      caa_enriched: totalCaaEnriched,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("fetch-notams error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
