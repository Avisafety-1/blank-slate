import {
  assertEquals,
  assertAlmostEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  addDjiDistanceSample,
  createDjiDistanceTracker,
  distanceMeters,
  resolveDjiTotalDistance,
} from "./dji-distance.ts";

Deno.test("distanceMeters computes haversine distance", () => {
  const d = distanceMeters(60, 11, 60, 11.001);
  assertAlmostEquals(d, 55.7, 0.5);
});

Deno.test("tracker sums a straight path and rejects jitter", () => {
  const tracker = createDjiDistanceTracker();
  for (let i = 0; i <= 10; i++) {
    addDjiDistanceSample(tracker, 60, 11 + i * 0.001, i * 10_000, 6);
  }
  // 10 segments of ~55.7 m ≈ 557 m
  assertEquals(tracker.totalMeters > 540 && tracker.totalMeters < 575, true);
});

Deno.test("tracker rejects impossible GPS jumps", () => {
  const tracker = createDjiDistanceTracker();
  addDjiDistanceSample(tracker, 60, 11, 0, 5);
  addDjiDistanceSample(tracker, 60, 11.001, 10_000, 5);
  const before = tracker.totalMeters;
  // Jump to a distant continent in one second must be ignored
  addDjiDistanceSample(tracker, 10, 100, 11_000, 5);
  assertEquals(tracker.totalMeters, before);
});

Deno.test("tracker skips invalid coordinates", () => {
  const tracker = createDjiDistanceTracker();
  addDjiDistanceSample(tracker, NaN, 11, 0, 5);
  addDjiDistanceSample(tracker, 0, 0, 10_000, 5);
  addDjiDistanceSample(tracker, 95, 11, 20_000, 5);
  assertEquals(tracker.totalMeters, 0);
  assertEquals(tracker.previous, null);
});

Deno.test("tracker ignores stationary jitter but counts real movement", () => {
  const tracker = createDjiDistanceTracker();
  // Hovering with tiny jitter, speed reported ~0
  for (let i = 0; i <= 5; i++) {
    addDjiDistanceSample(tracker, 60 + i * 0.0000001, 11 + i * 0.0000001, i * 1_000, 0);
  }
  assertEquals(tracker.totalMeters < 1, true);
});

Deno.test("resolveDjiTotalDistance corrects the kilometre-as-metre bug", () => {
  // DJI reported 1.778 in a field labelled [m]; GPS path is ~1778 m
  assertEquals(resolveDjiTotalDistance(1.778, 1778.3), 1778);
  assertEquals(resolveDjiTotalDistance(0.852, 852.1), 852);
});

Deno.test("resolveDjiTotalDistance keeps trustworthy metadata", () => {
  // Metadata close to GPS (within 2x) and not in the km-bug range
  assertEquals(resolveDjiTotalDistance(500, 480), 500);
});

Deno.test("resolveDjiTotalDistance uses GPS when metadata missing or absurd", () => {
  assertEquals(resolveDjiTotalDistance(null, 700), 700);
  assertEquals(resolveDjiTotalDistance(1, 852), 852);
  assertEquals(resolveDjiTotalDistance(50_000, 900), 900);
});

Deno.test("resolveDjiTotalDistance preserves zero and handles tiny tracks", () => {
  // No meaningful GPS track (<10 m): fall back to metadata
  assertEquals(resolveDjiTotalDistance(0, 5), 0);
  assertEquals(resolveDjiTotalDistance(3, 4), 3);
});
