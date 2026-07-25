// Poland PANSA KML backfill
// Accepts KML via POST body, parses Placemarks, upserts into airspace_zones.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { XMLParser } from 'npm:fast-xml-parser@4'

const FT_TO_M = 0.3048

function mapZone(type_: string, restriction: string) {
  const t = (type_ || '').toUpperCase()
  const r = (restriction || '').toUpperCase()
  if (r === 'DRA-P') return { zone_type: 'DRONE_NO_FLY', restriction_type: 'PROHIBITED', display_class: 'RED', theme: 'DRA-P', layer_id: 'rpas' }
  if (r === 'DRA-R') return { zone_type: 'DRONE_DANGER', restriction_type: 'RESTRICTED', display_class: 'AMBER', theme: 'DRA-R', layer_id: 'rpas' }
  if (r === 'DRA-I') return { zone_type: 'DRONE_PROTECTED_OBJECT', restriction_type: 'NOTIFICATION', display_class: 'AMBER', theme: 'DRA-I', layer_id: 'rpas' }
  if (t === 'CTR' || t.startsWith('CTR') || t === 'MCTR' || t.startsWith('MCTR'))
    return { zone_type: 'CTR', restriction_type: 'APPROVAL_REQUIRED', display_class: 'AMBER', theme: t, layer_id: 'airspace' }
  if (t === 'ATZ' || t.startsWith('ATZ'))
    return { zone_type: 'ATZ', restriction_type: 'APPROVAL_REQUIRED', display_class: 'AMBER', theme: t, layer_id: 'airspace' }
  if (t === 'RMZ') return { zone_type: 'RMZ', restriction_type: 'CAUTION', display_class: 'AMBER', theme: 'RMZ', layer_id: 'airspace' }
  if (t === 'TSA' || t === 'TRA' || t === 'MRT')
    return { zone_type: t, restriction_type: 'CAUTION', display_class: 'AMBER', theme: t, layer_id: 'restriksjonsomrader' }
  if (t === 'R') return { zone_type: 'R', restriction_type: 'RESTRICTED', display_class: 'RED', theme: 'R', layer_id: 'restriksjonsomrader' }
  if (t === 'D') return { zone_type: 'D', restriction_type: 'CAUTION', display_class: 'AMBER', theme: 'D', layer_id: 'restriksjonsomrader' }
  if (t === 'ADIZ') return { zone_type: 'ADIZ', restriction_type: 'NOTIFICATION', display_class: 'AMBER', theme: 'ADIZ', layer_id: 'airspace' }
  if (t === 'RPA') return { zone_type: 'DRONE_NO_FLY', restriction_type: 'PROHIBITED', display_class: 'RED', theme: 'RPA', layer_id: 'rpas' }
  return { zone_type: 'DRONE_DANGER', restriction_type: 'CAUTION', display_class: 'AMBER', theme: t || 'AREA', layer_id: 'airspace' }
}

function coordsToRing(text: string): string | null {
  const pts: string[] = []
  for (const tok of text.trim().split(/\s+/)) {
    const [lon, lat] = tok.split(',')
    if (lon && lat) pts.push(`${parseFloat(lon)} ${parseFloat(lat)}`)
  }
  if (pts.length < 3) return null
  if (pts[0] !== pts[pts.length - 1]) pts.push(pts[0])
  return `(${pts.join(',')})`
}

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v == null) return []
  return Array.isArray(v) ? v : [v]
}

function extractPolygons(geom: any): string[][] {
  // returns list of [outerRing, ...innerRings]
  const polys: any[] = []
  const collect = (g: any) => {
    if (!g) return
    if (g.Polygon) for (const p of asArray(g.Polygon)) polys.push(p)
    if (g.MultiGeometry) for (const mg of asArray(g.MultiGeometry)) collect(mg)
  }
  collect(geom)
  const out: string[][] = []
  for (const p of polys) {
    const outer = p?.outerBoundaryIs?.LinearRing?.coordinates
    if (!outer) continue
    const ring = coordsToRing(String(outer))
    if (!ring) continue
    const inners: string[] = []
    for (const ib of asArray(p?.innerBoundaryIs)) {
      const c = ib?.LinearRing?.coordinates
      if (c) {
        const ir = coordsToRing(String(c))
        if (ir) inners.push(ir)
      }
    }
    out.push([ring, ...inners])
  }
  return out
}

function parseDescription(desc: string) {
  const m = desc?.match(/Restriction:\s*([^,]+),\s*Type:\s*([^,]+),\s*Min:\s*(-?\d+)\s*ft,\s*Max:\s*(-?\d+)\s*ft/)
  if (!m) return null
  return { restriction: m[1].trim(), type_: m[2].trim(), min_ft: parseInt(m[3]), max_ft: parseInt(m[4]) }
}

function walkPlacemarks(node: any, out: any[]) {
  if (!node || typeof node !== 'object') return
  if (node.Placemark) for (const pm of asArray(node.Placemark)) out.push(pm)
  for (const k of ['Folder', 'Document']) {
    if (node[k]) for (const child of asArray(node[k])) walkPlacemarks(child, out)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const kml = await req.text()
    if (!kml || kml.length < 100) {
      return new Response(JSON.stringify({ error: 'Empty body; POST raw KML' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const parser = new XMLParser({ ignoreAttributes: false, textNodeName: '#text' })
    const doc = parser.parse(kml)
    const placemarks: any[] = []
    walkPlacemarks(doc?.kml?.Document ?? doc?.kml ?? doc, placemarks)

    const rows: any[] = []
    const seen = new Map<string, number>()
    let skipped = 0
    for (const pm of placemarks) {
      const desc = typeof pm?.description === 'string' ? pm.description : pm?.description?.['#text'] ?? ''
      const parsed = parseDescription(desc)
      if (!parsed) { skipped++; continue }
      const polys = extractPolygons(pm)
      if (polys.length === 0) { skipped++; continue }
      const wkt = polys.length === 1
        ? `POLYGON(${polys[0].join(',')})`
        : `MULTIPOLYGON(${polys.map(r => `(${r.join(',')})`).join(',')})`
      const m = mapZone(parsed.type_, parsed.restriction)
      const name = typeof pm?.name === 'string' ? pm.name : (pm?.name?.['#text'] ?? 'PL zone')
      const rawKey = `${name}|${parsed.type_}|${parsed.restriction}`
      const n = seen.get(rawKey) ?? 0
      seen.set(rawKey, n + 1)
      const external_id = n ? `${rawKey}|${n}` : rawKey
      rows.push({
        country_code: 'PL',
        source: 'pansa_kml_snapshot',
        external_id,
        zone_type: m.zone_type,
        restriction_type: m.restriction_type,
        display_class: m.display_class,
        theme: m.theme,
        layer_id: m.layer_id,
        name,
        short_name: name,
        authority: 'PANSA',
        lower_limit_m: Math.round(parsed.min_ft * FT_TO_M),
        upper_limit_m: Math.round(parsed.max_ft * FT_TO_M),
        lower_limit_raw: `${parsed.min_ft} ft AMSL`,
        upper_limit_raw: `${parsed.max_ft} ft AMSL`,
        altitude_reference: 'AMSL',
        active: true,
        properties: { pansa_type: parsed.type_, pansa_restriction: parsed.restriction, min_ft: parsed.min_ft, max_ft: parsed.max_ft },
        _wkt: wkt,
      })
    }

    // Upsert in chunks. Use RPC-friendly path: perform per-chunk INSERT via .rpc? We use direct upsert via PostgREST with geom set via SQL through a helper RPC.
    // Simpler: call a SQL function that accepts jsonb array.
    const CHUNK = 200
    let inserted = 0
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK)
      const { data, error } = await supabase.rpc('upsert_airspace_zones_pl', { rows: chunk })
      if (error) {
        return new Response(JSON.stringify({ error: error.message, at: i, sample: chunk[0] }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      inserted += (data as number) ?? chunk.length
    }

    return new Response(JSON.stringify({ placemarks: placemarks.length, parsed: rows.length, skipped, inserted }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
