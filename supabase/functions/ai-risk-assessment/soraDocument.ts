import { extractText, getDocumentProxy } from 'npm:unpdf@1.8.1';
import { createClient } from 'npm:@supabase/supabase-js@2';

type Source = { name: string; reference: string; readable: boolean } | null;

// All reads use the caller's JWT so mission, document and storage RLS remain authoritative.
export async function readMissionSoraDocument(url: string, anonKey: string, jwt: string, missionId: string): Promise<Source> {
  const client = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${jwt}` } } });
  const { data: mission, error: missionError } = await client.from('missions').select('sora_document_id').eq('id', missionId).maybeSingle();
  if (missionError || !mission) throw new Error('Mission is not accessible');
  if (!mission.sora_document_id) return null;
  const { data: doc, error } = await client.from('documents')
    .select('tittel, fil_url, fil_navn, fil_storrelse').eq('id', mission.sora_document_id).maybeSingle();
  if (error || !doc?.fil_url || !/\.pdf$/i.test(doc.fil_url) || !doc.fil_url.includes('/')) return null;
  const name = String(doc.tittel || doc.fil_navn || 'SORA').slice(0, 120);
  const fallback = { name, reference: '', readable: false };
  if (doc.fil_storrelse && doc.fil_storrelse > 8_000_000) return fallback;
  try {
    const { data: blob, error: downloadError } = await client.storage.from('documents').download(doc.fil_url);
    if (downloadError || !blob || blob.size > 8_000_000) return fallback;
    const pdf = await getDocumentProxy(new Uint8Array(await blob.arrayBuffer()));
    if (pdf.numPages > 40) return fallback;
    const { text } = await extractText(pdf);
    const pages = Array.isArray(text) ? text : [text];
    const reference = pages.map((page, index) => ({ page: index + 1, text: page.replace(/\s+/g, ' ').trim() }))
      .filter((page) => page.text.length > 30)
      .map((page) => `[page ${page.page}] ${page.text.slice(0, 1800)}`)
      .join('\n').slice(0, 12000);
    return reference ? { name, reference, readable: true } : fallback;
  } catch {
    return fallback;
  }
}