// Shared SORA SAIL matrix (fGRC x ARC)
export const SAIL_MATRIX: Record<string, Record<string, string>> = {
  "≤2": { a: "I", b: "II", c: "IV", d: "VI" },
  "3": { a: "II", b: "II", c: "IV", d: "VI" },
  "4": { a: "III", b: "III", c: "IV", d: "VI" },
  "5": { a: "IV", b: "IV", c: "IV", d: "VI" },
  "6": { a: "V", b: "V", c: "V", d: "VI" },
  "7": { a: "VI", b: "VI", c: "VI", d: "VI" },
};

export const fgrcRow = (fgrc: number): string =>
  fgrc <= 2 ? "≤2" : String(Math.min(Math.round(fgrc), 7));

export const arcColumn = (arc?: string | null): string | null => {
  const match = String(arc ?? "").toLowerCase().match(/[abcd]/);
  return match ? match[0] : null;
};

/** Derive SAIL (I-VI) from a numeric fGRC and an ARC string (e.g. "ARC-b"). */
export const deriveSail = (
  fgrc?: number | string | null,
  arc?: string | null
): string | null => {
  const numeric = typeof fgrc === "number" ? fgrc : parseInt(String(fgrc ?? ""), 10);
  const col = arcColumn(arc);
  if (!col || !Number.isFinite(numeric)) return null;
  return SAIL_MATRIX[fgrcRow(numeric)]?.[col] ?? null;
};
