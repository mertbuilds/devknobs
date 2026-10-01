import type { GeoValue, TimeZoneValue } from "../types";
import { resolveGeo } from "./geo";

/** Zones the panel offers. Kolkata, Kathmandu and Lord Howe cover the odd offsets. */
export const TIME_ZONE_PRESETS = [
  "UTC",
  "America/Los_Angeles",
  "America/New_York",
  "Europe/London",
  "Europe/Istanbul",
  "Asia/Kolkata",
  "Asia/Kathmandu",
  "Asia/Tokyo",
  "Australia/Lord_Howe",
] as const;

const NativeDateTimeFormat = Intl.DateTimeFormat;
const nativeGetTime = Date.prototype.getTime;

const MINUTE = 60_000;

/** The engine's own spelling of a zone, or null when it does not know the zone. */
export function canonicalZone(zone: string): string | null {
  try {
    return new NativeDateTimeFormat("en-US", { timeZone: zone }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

/** The zone to emulate, or null to leave the host zone alone. */
export function resolveTimeZone(value: TimeZoneValue, geo: GeoValue): string | null {
  if (value === "system") return null;
  const zone = value === "geo" ? resolveGeo(geo)?.timeZone : value;
  return zone ? canonicalZone(zone) : null;
}

/** One formatter per zone: building one costs far more than using it. */
const offsetFormats = new Map<string, Intl.DateTimeFormat | null>();

function offsetFormat(zone: string): Intl.DateTimeFormat | null {
  let format = offsetFormats.get(zone);
  if (format === undefined) {
    try {
      format = new NativeDateTimeFormat("en-US", { timeZone: zone, timeZoneName: "longOffset" });
    } catch {
      format = null;
    }
    offsetFormats.set(zone, format);
  }
  return format;
}

/**
 * How far the zone's wall clock runs ahead of UTC at an instant, in ms:
 * Europe/Istanbul is +3 h, America/New_York in winter is -5 h. An unknown
 * zone reads as UTC.
 */
export function zoneOffset(time: number, zone: string): number {
  const format = offsetFormat(zone);
  if (!format || !Number.isFinite(time)) return 0;
  // Formatting refuses instants outside the Date range, and no zone moves out there.
  const clamped = Math.min(Math.max(time, -8.64e15), 8.64e15);
  const name = format.formatToParts(clamped).find((part) => part.type === "timeZoneName")?.value;
  const match = /GMT([+-])(\d{1,2})(?::?(\d{2}))?(?::?(\d{2}))?/.exec(name ?? "");
  if (!match) return 0;
  const sign = match[1] === "+" ? 1 : -1;
  const seconds = Number(match[2]) * 3600 + Number(match[3] ?? 0) * 60 + Number(match[4] ?? 0);
  return sign * seconds * 1000;
}

/**
 * Minutes to add to local time to get UTC, the way `getTimezoneOffset` reports
 * it: Europe/Istanbul is -180, America/New_York in winter is 300.
 */
export function offsetMinutesFor(date: Date, timeZone: string): number {
  const minutes = -zoneOffset(nativeGetTime.call(date), timeZone) / MINUTE;
  return minutes === 0 ? 0 : minutes;
}

let zone: string | null = null;
let nativeGetTimezoneOffset: (this: Date) => number = Date.prototype.getTimezoneOffset;
let timePatched = false;

function withTimeZone(
  options: Intl.DateTimeFormatOptions | undefined,
): Intl.DateTimeFormatOptions | undefined {
  if (!zone) return options;
  if (options?.timeZone) return options;
  return { ...(options ?? {}), timeZone: zone };
}

function patchTime(): void {
  if (timePatched) return;
  nativeGetTimezoneOffset = Date.prototype.getTimezoneOffset;
  Date.prototype.getTimezoneOffset = function getTimezoneOffset(this: Date): number {
    if (!zone) return nativeGetTimezoneOffset.call(this);
    return offsetMinutesFor(this, zone);
  };
  Intl.DateTimeFormat = new Proxy(NativeDateTimeFormat, {
    construct(target, args: unknown[], newTarget) {
      const [locales, options] = args as [Intl.LocalesArgument?, Intl.DateTimeFormatOptions?];
      return Reflect.construct(target, [locales, withTimeZone(options)], newTarget);
    },
    apply(target, thisArg, args: unknown[]) {
      const [locales, options] = args as [Intl.LocalesArgument?, Intl.DateTimeFormatOptions?];
      return Reflect.apply(target as (...rest: unknown[]) => unknown, thisArg, [
        locales,
        withTimeZone(options),
      ]);
    },
  });
  timePatched = true;
}

function restoreTime(): void {
  if (!timePatched) return;
  Date.prototype.getTimezoneOffset = nativeGetTimezoneOffset;
  Intl.DateTimeFormat = NativeDateTimeFormat;
  timePatched = false;
}

/** Emulate an IANA zone, or hand the host zone back for null. */
export function apply(value: string | null): void {
  zone = value;
  if (!zone) {
    restoreTime();
    return;
  }
  patchTime();
}

export function reset(): void {
  zone = null;
  restoreTime();
}
