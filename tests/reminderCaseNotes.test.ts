import { describe, expect, test } from "bun:test";
import { addIncidentComment, addMissionNote, commentTargetFor, formatMissionNote } from "../src/lib/reminderCaseNotes";
import { MUTATING_ACTIONS } from "../supabase/functions/_shared/reminderActions";

function fakeDb(existing: string | null = "Gammel") {
  const calls: { table: string; op: string; payload?: any; id?: string }[] = [];
  const db = {
    from(table: string) {
      return {
        select: () => ({ eq: () => ({ single: async () => ({ data: { merknader: existing }, error: null }) }) }),
        update: (payload: any) => ({ eq: async (_c: string, id: string) => { calls.push({ table, op: "update", payload, id }); return { error: null }; } }),
        insert: async (payload: any) => { calls.push({ table, op: "insert", payload }); return { error: null }; },
      };
    },
  };
  return { db, calls };
}
const now = new Date(2026, 9, 10, 18, 40);
const opts = { now, locale: "nb-NO" };

describe("comment target per mutating action", () => {
  test("every mutating action has a case target", () => {
    for (const a of MUTATING_ACTIONS) expect(commentTargetFor(a)).not.toBeNull();
  });
  test("mission actions → mission, incident actions → incident", () => {
    for (const a of ["notFlown", "flown", "finishMission", "endFlight", "writeMissionExplanation"] as const) expect(commentTargetFor(a)).toBe("mission");
    for (const a of ["takeResponsibility", "addIncidentComment"] as const) expect(commentTargetFor(a)).toBe("incident");
  });
});

describe("mission note", () => {
  test("format with action prefix", () => {
    expect(formatMissionNote(" Vind ", { ...opts, prefix: "Ble ikke fløyet (via påminnelse)" }))
      .toBe("[10.10.2026 18:40] Ble ikke fløyet (via påminnelse): Vind");
  });
  for (const status of ["Avbrutt", "Fullført"]) {
    test(`status ${status} + non-empty comment saved in same update`, async () => {
      const { db, calls } = fakeDb();
      await addMissionNote(db, "m1", "Vind", { ...opts, prefix: "X", extra: { status } });
      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({ table: "missions", id: "m1", payload: { status, merknader: "Gammel\n\n[10.10.2026 18:40] X: Vind" } });
    });
    test(`status ${status} + empty comment writes no merknader`, async () => {
      const { db, calls } = fakeDb();
      await addMissionNote(db, "m1", "   ", { ...opts, prefix: "X", extra: { status } });
      expect(calls[0].payload).toEqual({ status });
    });
  }
  test("endFlight / explanation: empty comment writes nothing", async () => {
    const { db, calls } = fakeDb();
    await addMissionNote(db, "m1", "", opts);
    expect(calls).toHaveLength(0);
  });
  test("explanation saved on mission without prefix", async () => {
    const { db, calls } = fakeDb(null);
    await addMissionNote(db, "m2", "Forklaring", opts);
    expect(calls[0]).toMatchObject({ id: "m2", payload: { merknader: "[10.10.2026 18:40] Forklaring" } });
  });
});

describe("incident comment (takeResponsibility, addIncidentComment)", () => {
  test("non-empty comment inserted on incident", async () => {
    const { db, calls } = fakeDb();
    await addIncidentComment(db, "i1", " Tar den ", { userId: "u", name: "Ola" });
    expect(calls[0]).toMatchObject({ table: "incident_comments", payload: { incident_id: "i1", comment_text: "Tar den", user_id: "u" } });
  });
  test("empty comment inserts nothing", async () => {
    const { db, calls } = fakeDb();
    await addIncidentComment(db, "i1", "  ", { userId: "u", name: "Ola" });
    expect(calls).toHaveLength(0);
  });
});
