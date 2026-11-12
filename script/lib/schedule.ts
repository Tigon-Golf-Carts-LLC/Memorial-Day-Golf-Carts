/**
 * The daily inventory schedule, as a pure function of the clock and the
 * snapshot already committed. Every deploy run (scheduled, push, manual) asks
 * `planPull()` what to do, so the rules hold however the build was started.
 *
 *   Sync day   the calendar date in America/New_York (EST/EDT aware).
 *   DMS        only from 12:00 AM to 5:00 AM ET, at most 3 attempts a day,
 *              about an hour apart, and never started with < 15 min left.
 *   IOT        recovery: right after the 3rd DMS attempt, when no DMS attempt
 *              can still run inside the window, or any time from 5:00 AM on
 *              while the day has no successful pull.
 *   Once a day after any source succeeds (the committed snapshot is a live
 *              pull dated today), nothing is pulled until the next sync day.
 *
 * There is no database, so attempt counts are not stored: a DMS attempt's
 * number is derived from the real time elapsed since ET midnight (attempt 1
 * in the first hour, 2 in the second, 3 in the third). Elapsed time, not the
 * wall clock, is what makes November's repeated 1:00 AM hour still allow only
 * three DMS attempts. The cron in .github/workflows/deploy.yml fires once in
 * each of those hours.
 */

export const TIMEZONE = "America/New_York";

const num = (name: string, fallback: number) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

export const DMS_WINDOW_END_HOUR = 5;
export const DMS_MAX_ATTEMPTS_PER_DAY = num("DMS_MAX_ATTEMPTS_PER_DAY", 3);
export const DMS_ATTEMPT_SPACING_MINUTES = num("DMS_ATTEMPT_SPACING_MINUTES", 60);
export const DMS_MIN_TIME_REMAINING_MINUTES = num("DMS_MIN_TIME_REMAINING_MINUTES", 15);

/** Wall-clock parts of `at` in Eastern time. */
function easternParts(at: number) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TIMEZONE, hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    })
      .formatToParts(new Date(at))
      .map((part) => [part.type, part.value]),
  );
  return {
    year: Number(parts.year), month: Number(parts.month), day: Number(parts.day),
    hour: Number(parts.hour), minute: Number(parts.minute), second: Number(parts.second),
  };
}

/** Eastern offset from UTC at `at`, in minutes (−300 for EST, −240 for EDT). */
function offsetMinutes(at: number): number {
  const p = easternParts(at);
  return (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(at / 1000) * 1000) / 60_000;
}

/** The Eastern calendar date of `at`, as YYYY-MM-DD. */
export function easternDate(at: number | string | Date = Date.now()): string {
  const p = easternParts(new Date(at).getTime());
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** The instant of Eastern wall-clock `hour`:00 on the Eastern date of `at`. */
function easternInstant(at: number, hour: number): number {
  const p = easternParts(at);
  const naive = Date.UTC(p.year, p.month - 1, p.day, hour);
  // First guess with the offset near `naive`, then once more with the offset
  // at the guess itself, which is right even on a DST-change day.
  const guess = naive - offsetMinutes(naive) * 60_000;
  return naive - offsetMinutes(guess) * 60_000;
}

export type PullSource = "DMS" | "IOT";

export interface PullPlan {
  /** Sources to try, in order. Empty means: do not pull, keep the snapshot. */
  sources: PullSource[];
  /** One line, for the log and the run summary. */
  reason: string;
  /** Eastern sync day this run belongs to. */
  syncDate: string;
  /** No DMS request may start at or after this instant (5:00 AM ET). */
  dmsDeadline: number;
}

export interface PreviousSnapshot {
  source?: string;
  updatedAt?: string;
}

/** A snapshot produced by a real pull, as opposed to the offline fixture. */
export function isLivePull(snapshot: PreviousSnapshot | null): boolean {
  return snapshot?.source === "dms-live" || snapshot?.source === "iot-live";
}

export function planPull(
  now: number,
  previous: PreviousSnapshot | null,
  options: { dmsEnabled?: boolean; iotEnabled?: boolean } = {},
): PullPlan {
  const dmsEnabled = options.dmsEnabled ?? true;
  const iotEnabled = options.iotEnabled ?? true;
  const syncDate = easternDate(now);
  const midnight = easternInstant(now, 0);
  const dmsDeadline = easternInstant(now, DMS_WINDOW_END_HOUR);
  const base = { syncDate, dmsDeadline };

  if (isLivePull(previous) && previous?.updatedAt && easternDate(previous.updatedAt) === syncDate) {
    return {
      ...base, sources: [],
      reason: `already updated today (${previous.source} at ${previous.updatedAt}) — next pull tonight 12:00 AM ET (DMS)`,
    };
  }

  const iot: PullSource[] = iotEnabled ? ["IOT"] : [];
  const minutesLeft = (dmsDeadline - now) / 60_000;
  const elapsed = (now - midnight) / 60_000;
  const attempt = Math.floor(elapsed / DMS_ATTEMPT_SPACING_MINUTES) + 1;

  if (dmsEnabled && now < dmsDeadline) {
    if (attempt <= DMS_MAX_ATTEMPTS_PER_DAY && minutesLeft >= DMS_MIN_TIME_REMAINING_MINUTES) {
      // Is there room for another DMS attempt after this one?
      const nextStart = midnight + attempt * DMS_ATTEMPT_SPACING_MINUTES * 60_000;
      const another =
        attempt < DMS_MAX_ATTEMPTS_PER_DAY &&
        (dmsDeadline - nextStart) / 60_000 >= DMS_MIN_TIME_REMAINING_MINUTES;
      return {
        ...base,
        sources: another ? ["DMS"] : ["DMS", ...iot],
        reason: another
          ? `overnight window: DMS attempt ${attempt} of ${DMS_MAX_ATTEMPTS_PER_DAY}`
          : `overnight window: DMS attempt ${attempt} of ${DMS_MAX_ATTEMPTS_PER_DAY} (last) — IOT if it fails`,
      };
    }
    return { ...base, sources: iot, reason: "overnight window, but no DMS attempt can still run — IOT recovery" };
  }

  return {
    ...base,
    sources: iot,
    reason: dmsEnabled
      ? "no successful pull yet today and the DMS window (12–5 AM ET) has passed — IOT recovery"
      : "DMS disabled — IOT",
  };
}
