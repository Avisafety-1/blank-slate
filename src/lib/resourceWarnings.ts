export interface LogEntryLike {
  title: string;
  entry_date: string;
  entry_type?: string | null;
  description?: string | null;
  created_at?: string | null;
}

const STATUS_CHANGE_PATTERNS = [
  /status endret/i,
  /status changed/i,
];

function isStatusChangeEntry(entry: LogEntryLike): boolean {
  if ((entry.entry_type || "").toLowerCase() === "kvittering") return true;
  const text = `${entry.title || ""} ${entry.description || ""}`;
  return STATUS_CHANGE_PATTERNS.some((p) => p.test(text));
}

/**
 * Returns the newest "Advarsel" entry, but only when no newer entry has
 * acknowledged the warning or manually changed the resource status.
 * Prevents stale warning titles from being shown as the reason for a
 * status that was set by a later manual logbook entry.
 */
export function pickLatestRelevantWarning(
  entries: LogEntryLike[] | null | undefined,
): { title: string; entry_date: string } | null {
  if (!entries || entries.length === 0) return null;
  const sorted = [...entries].sort((a, b) => {
    const at = new Date(a.created_at || a.entry_date).getTime();
    const bt = new Date(b.created_at || b.entry_date).getTime();
    return bt - at;
  });
  for (const entry of sorted) {
    if (isStatusChangeEntry(entry)) return null;
    if ((entry.entry_type || "") === "Advarsel") {
      return { title: entry.title, entry_date: entry.entry_date };
    }
  }
  return null;
}
