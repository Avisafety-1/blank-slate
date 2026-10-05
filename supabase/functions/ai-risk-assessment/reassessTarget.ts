// Which stored assessment a SORA re-assessment may build on.
// Allowed: the newest non-SORA assessment for the mission, or a SORA row created
// after it (which carries the same base analysis plus any later manual edits).

export interface AssessmentRow {
  id: string;
  mission_id: string;
  created_at: string;
  sora_output?: unknown;
  ai_analysis?: unknown;
}

export type ReassessCheck =
  | { ok: true; row: AssessmentRow }
  | { ok: false; reason: 'missing_id' | 'not_found' | 'wrong_mission' | 'not_latest' };

export const checkReassessTarget = (
  rows: AssessmentRow[],
  targetId: string | null | undefined,
  missionId: string,
): ReassessCheck => {
  if (!targetId) return { ok: false, reason: 'missing_id' };
  const target = rows.find((r) => r.id === targetId);
  if (!target) return { ok: false, reason: 'not_found' };
  if (target.mission_id !== missionId) return { ok: false, reason: 'wrong_mission' };
  const sorted = [...rows]
    .filter((r) => r.mission_id === missionId)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const latestBase = sorted.find((r) => r.sora_output == null);
  if (!latestBase) return { ok: false, reason: 'not_latest' };
  if (target.id === latestBase.id) return { ok: true, row: target };
  const isNewerSora = target.sora_output != null &&
    new Date(target.created_at).getTime() >= new Date(latestBase.created_at).getTime();
  return isNewerSora ? { ok: true, row: target } : { ok: false, reason: 'not_latest' };
};

export const reassessNotLatestMessage = (lang: 'no' | 'en') =>
  lang === 'en' ? 'Run the re-assessment on the latest assessment' : 'Kjør revurdering på siste vurdering';
