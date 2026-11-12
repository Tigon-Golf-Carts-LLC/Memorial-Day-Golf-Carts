/**
 * The daily inventory schedule (script/lib/schedule.ts), with an injected
 * clock so every rule — including both DST change days — runs instantly.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { planPull, easternDate } from "../script/lib/schedule.ts";

const at = (iso: string) => Date.parse(iso);
const fixture = { source: "dms-fixture", updatedAt: "2026-09-03T15:24:39+00:00" };

describe("inventory schedule", () => {
  test("Eastern sync day, not UTC", () => {
    assert.equal(easternDate("2026-11-12T03:00:00Z"), "2026-11-11"); // 10 PM EST
    assert.equal(easternDate("2026-11-12T05:00:00Z"), "2026-11-12"); // midnight EST
    assert.equal(easternDate("2026-07-01T04:00:00Z"), "2026-07-01"); // midnight EDT
  });

  test("12:00 AM ET: DMS first, no IOT unless it is the last DMS attempt", () => {
    const plan = planPull(at("2026-11-12T05:17:00Z"), fixture);
    assert.deepEqual(plan.sources, ["DMS"]);
  });

  test("third DMS attempt is followed by IOT; there is never a fourth DMS attempt", () => {
    assert.deepEqual(planPull(at("2026-11-12T06:17:00Z"), fixture).sources, ["DMS"]);
    assert.deepEqual(planPull(at("2026-11-12T07:17:00Z"), fixture).sources, ["DMS", "IOT"]);
    assert.deepEqual(planPull(at("2026-11-12T08:17:00Z"), fixture).sources, ["IOT"]);
  });

  test("less than 15 minutes before 5:00 AM: no DMS", () => {
    assert.deepEqual(planPull(at("2026-11-12T09:50:00Z"), fixture).sources, ["IOT"]);
  });

  test("woke at 10:00 AM ET with no success today: IOT recovery", () => {
    const plan = planPull(at("2026-11-12T15:00:00Z"), { source: "dms-live", updatedAt: "2026-11-11T05:20:00Z" });
    assert.deepEqual(plan.sources, ["IOT"]);
  });

  test("already updated today: no DMS or IOT call", () => {
    for (const source of ["dms-live", "iot-live"]) {
      const plan = planPull(at("2026-11-12T20:00:00Z"), { source, updatedAt: "2026-11-12T05:20:00Z" });
      assert.deepEqual(plan.sources, []);
    }
    // ...but the offline fixture never counts as today's pull.
    assert.deepEqual(planPull(at("2026-11-12T20:00:00Z"), { ...fixture, updatedAt: "2026-11-12T05:20:00Z" }).sources, ["IOT"]);
  });

  test("a pull at 11 PM ET belongs to that Eastern day, not the next UTC day", () => {
    // 11:30 PM EST on Nov 11 = 04:30 UTC on Nov 12.
    const plan = planPull(at("2026-11-12T04:30:00Z"), { source: "iot-live", updatedAt: "2026-11-11T20:00:00Z" });
    assert.deepEqual(plan.sources, []);
  });

  test("5:00 AM cutoff instant is DST aware", () => {
    assert.equal(new Date(planPull(at("2026-11-12T05:17:00Z"), fixture).dmsDeadline).toISOString(), "2026-11-12T10:00:00.000Z");
    assert.equal(new Date(planPull(at("2026-07-01T04:17:00Z"), fixture).dmsDeadline).toISOString(), "2026-07-01T09:00:00.000Z");
  });

  test("March DST change: window still 12–5 AM local, three DMS attempts", () => {
    // 2026-03-08: 2:00 AM EST jumps to 3:00 AM EDT.
    assert.deepEqual(planPull(at("2026-03-08T05:17:00Z"), fixture).sources, ["DMS"]); // 12:17 EST
    assert.deepEqual(planPull(at("2026-03-08T06:17:00Z"), fixture).sources, ["DMS"]); // 1:17 EST
    assert.deepEqual(planPull(at("2026-03-08T07:17:00Z"), fixture).sources, ["DMS", "IOT"]); // 3:17 EDT
    assert.equal(new Date(planPull(at("2026-03-08T05:17:00Z"), fixture).dmsDeadline).toISOString(), "2026-03-08T09:00:00.000Z");
  });

  test("November DST change: the repeated 1:00 AM hour still allows only three DMS attempts", () => {
    // 2026-11-01: 2:00 AM EDT falls back to 1:00 AM EST.
    const runs = ["04:17", "05:17", "06:17", "07:17", "08:17", "09:17"].map((time) =>
      planPull(at(`2026-11-01T${time}:00Z`), fixture),
    );
    const dmsAttempts = runs.filter((plan) => plan.sources.includes("DMS")).length;
    assert.equal(dmsAttempts, 3);
    assert.deepEqual(runs[2].sources, ["DMS", "IOT"]); // second 1:17 AM (EST)
    assert.equal(new Date(runs[0].dmsDeadline).toISOString(), "2026-11-01T10:00:00.000Z");
  });

  test("DMS disabled goes straight to IOT; IOT disabled never adds it", () => {
    assert.deepEqual(planPull(at("2026-11-12T05:17:00Z"), fixture, { dmsEnabled: false }).sources, ["IOT"]);
    assert.deepEqual(planPull(at("2026-11-12T15:00:00Z"), fixture, { iotEnabled: false }).sources, []);
  });
});
