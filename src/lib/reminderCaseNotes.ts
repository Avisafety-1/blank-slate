/**
 * Saves the comment from a reminder confirmation dialog on the case itself
 * (mission notes or incident comments), not only in the reminder thread.
 */
import type { ReminderActionId } from "@/components/reminders/reminderActions";

export type CommentTarget = "mission" | "incident" | null;

/** Where a mutating action stores its dialog comment. */
export function commentTargetFor(action: ReminderActionId): CommentTarget {
  switch (action) {
    case "notFlown":
    case "flown":
    case "finishMission":
    case "endFlight":
    case "writeMissionExplanation":
      return "mission";
    case "takeResponsibility":
    case "addIncidentComment":
      return "incident";
    default:
      return null;
  }
}

/** "[10.10.2026 18:40]" in the user's locale. */
export function formatNoteTimestamp(now: Date, locale: string): string {
  const date = now.toLocaleDateString(locale, { day: "2-digit", month: "2-digit", year: "numeric" });
  const time = now.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  return `[${date} ${time}]`;
}

/** One note line: "[ts] Prefix: text" or "[ts] text". */
export function formatMissionNote(text: string, opts: { now: Date; locale: string; prefix?: string | null }): string {
  const ts = formatNoteTimestamp(opts.now, opts.locale);
  return opts.prefix ? `${ts} ${opts.prefix}: ${text.trim()}` : `${ts} ${text.trim()}`;
}

/** Appends a note to existing merknader. Empty text returns the existing value unchanged. */
export function appendMissionNote(existing: string | null | undefined, note: string | null): string | null {
  if (!note) return existing ?? null;
  return [existing, note].filter(Boolean).join("\n\n");
}

// deno-lint-ignore no-explicit-any
type Db = any;

/**
 * Adds a note to a mission; optional extra fields (e.g. status) are saved in the same update.
 * Empty comment: only the extra fields are written (if any) — never an empty note.
 */
export async function addMissionNote(
  db: Db,
  missionId: string,
  comment: string,
  opts: { now: Date; locale: string; prefix?: string | null; extra?: Record<string, unknown> },
): Promise<void> {
  const text = comment.trim();
  const update: Record<string, unknown> = { ...(opts.extra ?? {}) };
  if (text) {
    const { data, error: readErr } = await db.from("missions").select("merknader").eq("id", missionId).single();
    if (readErr) throw readErr;
    update.merknader = appendMissionNote(data?.merknader, formatMissionNote(text, opts));
  }
  if (!Object.keys(update).length) return;
  const { error } = await db.from("missions").update(update).eq("id", missionId);
  if (error) throw error;
}

/** Adds a comment to an incident. Empty comment does nothing. */
export async function addIncidentComment(
  db: Db,
  incidentId: string,
  comment: string,
  author: { userId: string; name: string },
): Promise<void> {
  const text = comment.trim();
  if (!text) return;
  const { error } = await db.from("incident_comments").insert({
    incident_id: incidentId, user_id: author.userId, comment_text: text, created_by_name: author.name,
  });
  if (error) throw error;
}
