import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { applyGroundMitigations, columnIndex, computeIgrc, lookupSail, populationRowIndex } from './soraGroundRisk.ts';

const igrc = (dimensionM: number, speedMps: number, densityPerKm2: number, controlled = false, weightKg: number | null = 5) =>
  computeIgrc({ dimensionM, speedMps, weightKg, densityPerKm2, controlled });

Deno.test('Matrice 350 RTK (0.9 m, 23 m/s), density 300 -> iGRC 4', () => {
  assertEquals(igrc(0.9, 23, 300).igrc, 4);
});
Deno.test('Mavic 3E (0.4 m, 21 m/s), density 30 -> iGRC 3', () => {
  assertEquals(igrc(0.4, 21, 30, false, 0.9).igrc, 3);
});
Deno.test('0.9 m but 30 m/s -> column 1, density 300 -> iGRC 5', () => {
  assertEquals(columnIndex(0.9, 30), 1);
  assertEquals(igrc(0.9, 30, 300).igrc, 5);
});
Deno.test('measured density 0 -> band < 5 -> iGRC 2 (col 0)', () => {
  assertEquals(populationRowIndex(0, false), 1);
  assertEquals(igrc(0.9, 23, 0).igrc, 2);
});
Deno.test('controlled ground area -> iGRC 1 (col 0), 2 (col 2)', () => {
  assertEquals(igrc(0.9, 23, 300, true).igrc, 1);
  assertEquals(igrc(5, 23, 300, true).igrc, 2);
});
Deno.test('density 60 000, col 2 -> outside specific', () => {
  const r = igrc(5, 23, 60000);
  assertEquals(r.igrc, null);
  assertEquals(r.outsideSora, true);
});
Deno.test('dimension > 40 m -> outside specific', () => {
  assertEquals(igrc(41, 23, 10).outsideSora, true);
});
Deno.test('unknown density 5000 -> band < 50 000', () => {
  assertEquals(populationRowIndex(5000, false), 5);
  assertEquals(igrc(0.9, 23, 5000).igrc, 6);
});
Deno.test('<= 250 g and <= 25 m/s -> iGRC 1', () => {
  assertEquals(igrc(0.2, 16, 3000, false, 0.249).igrc, 1);
});
Deno.test('M1(B) Medium -1, High -2', () => {
  const base = { igrc: 5, controlledMinimum: 1 };
  assertEquals(applyGroundMitigations({ ...base, manual: { m1b_operational_restrictions: { applicable: true, robustness: 'Medium' } } }).fgrc, 4);
  assertEquals(applyGroundMitigations({ ...base, manual: { m1b_operational_restrictions: { applicable: true, robustness: 'High' } } }).fgrc, 3);
});
Deno.test('M2 without manual selection -> 0', () => {
  const r = applyGroundMitigations({ igrc: 5, controlledMinimum: 1 });
  assertEquals(r.effective.m2_impact_reduction, 0);
  assertEquals(r.fgrc, 5);
});
Deno.test('fGRC floor at controlled-ground value', () => {
  const r = applyGroundMitigations({ igrc: 4, controlledMinimum: 2, manual: { m1a_sheltering: { applicable: true, robustness: 'Medium' } }, autoM1c: -1 });
  assertEquals(r.fgrc, 2);
});
Deno.test('fGRC 8 -> no SAIL, certified category', () => {
  assertEquals(lookupSail(8, 'b'), { sail: null, certified: true });
  assertEquals(lookupSail(7, 'b').sail, 'VI');
  assertEquals(lookupSail(2, 'b').sail, 'II');
});
