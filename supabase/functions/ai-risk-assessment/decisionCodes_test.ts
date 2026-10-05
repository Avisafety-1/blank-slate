import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { normalizeCategoryDecisions, normalizeDecisionCode } from "./decisionCodes.ts";

Deno.test("EN decision labels map to internal codes", () => {
  assertEquals(normalizeDecisionCode("CONDITIONAL"), "BETINGET");
  assertEquals(normalizeDecisionCode("Not assessed"), "IKKE VURDERT");
  assertEquals(normalizeDecisionCode("NOT_ASSESSED"), "IKKE VURDERT");
  assertEquals(normalizeDecisionCode("GO"), "GO");
  assertEquals(normalizeDecisionCode("BETINGET"), "BETINGET");
});

Deno.test("categories normalized in place", () => {
  const a: any = { categories: { weather: { go_decision: "NOT ASSESSED" }, airspace: { go_decision: "CONDITIONAL" } } };
  normalizeCategoryDecisions(a);
  assertEquals(a.categories.weather.go_decision, "IKKE VURDERT");
  assertEquals(a.categories.airspace.go_decision, "BETINGET");
});
