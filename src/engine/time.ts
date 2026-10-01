import type { GeoValue, TimeZoneValue } from "../types";
import { resolveGeo } from "./geo";
import { underLocale } from "./intl";

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

type Method = (this: Date, ...args: unknown[]) => unknown;
type NowMethod = (this: unknown, timeZone?: unknown) => unknown;

const NativeDate = Date;
const NativeDateTimeFormat = Intl.DateTimeFormat;
const dateMethods = Date.prototype as unknown as Record<string, Method>;
const nativeGetTime = Date.prototype.getTime;
const nativeSetTime = Date.prototype.setTime;
const nativeHostOffset = Date.prototype.getTimezoneOffset;
const nativeParse = Date.parse;
const nativeUTC = Date.UTC;

const MINUTE = 60_000;
const DAY = 86_400_000;

const canonicalZones = new Map<string, string | null>();

/** The engine's own spelling of a zone, or null when it does not know the zone. */
export function canonicalZone(zone: string): string | null {
  let canonical = canonicalZones.get(zone);
  if (canonical === undefined) {
    try {
      canonical = new NativeDateTimeFormat("en-US", { timeZone: zone }).resolvedOptions().timeZone;
    } catch {
      canonical = null;
    }
    canonicalZones.set(zone, canonical);
  }
  return canonical;
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

/** The zone name a formatter prints for an instant. */
function zoneNamePart(format: Intl.DateTimeFormat, time: number): string {
  // Formatting refuses instants outside the Date range, and no zone moves out there.
  const clamped = Math.min(Math.max(time, -8.64e15), 8.64e15);
  return format.formatToParts(clamped).find((part) => part.type === "timeZoneName")?.value ?? "";
}

/**
 * How far the zone's wall clock runs ahead of UTC at an instant, in ms:
 * Europe/Istanbul is +3 h, America/New_York in winter is -5 h. An unknown
 * zone reads as UTC.
 */
export function zoneOffset(time: number, zone: string): number {
  const format = offsetFormat(zone);
  if (!format || !Number.isFinite(time)) return 0;
  const match = /GMT([+-])(\d{1,2})(?::?(\d{2}))?(?::?(\d{2}))?/.exec(zoneNamePart(format, time));
  if (!match) return 0;
  const sign = match[1] === "+" ? 1 : -1;
  const seconds = Number(match[2]) * 3600 + Number(match[3] ?? 0) * 60 + Number(match[4] ?? 0);
  return sign * seconds * 1000;
}

/** Whole minutes behind UTC, cut toward zero the way engines cut old local mean times. */
function offsetMinutes(offset: number): number {
  const minutes = Math.trunc(-offset / MINUTE);
  return minutes === 0 ? 0 : minutes;
}

/**
 * Minutes to add to local time to get UTC, the way `getTimezoneOffset` reports
 * it: Europe/Istanbul is -180, America/New_York in winter is 300.
 */
export function offsetMinutesFor(date: Date, timeZone: string): number {
  return offsetMinutes(zoneOffset(nativeGetTime.call(date), timeZone));
}

/**
 * The instant a wall clock reading names in a zone, picked the way browsers
 * pick it for `new Date(y, m, d, ...)`: in an overlap the earlier of the two
 * instants, in a gap the offset from before the jump, which moves the reading
 * forward by the size of the gap. `wall` is the reading as if it were UTC.
 */
export function fromWall(wall: number, zone: string): number {
  if (!Number.isFinite(wall)) return NaN;
  // No offset reaches a day, so these two are the offsets either side of any jump.
  const before = zoneOffset(wall - DAY, zone);
  const after = zoneOffset(wall + DAY, zone);
  let earliest = NaN;
  for (const offset of before === after ? [before] : [before, after]) {
    const time = wall - offset;
    if (zoneOffset(time, zone) !== offset) continue;
    if (Number.isNaN(earliest) || time < earliest) earliest = time;
  }
  return Number.isNaN(earliest) ? wall - before : earliest;
}

/** The local fields, each read and written through its UTC twin on a shifted clock. */
const FIELDS = [
  "FullYear",
  "Month",
  "Date",
  "Day",
  "Hours",
  "Minutes",
  "Seconds",
  "Milliseconds",
] as const;

type Field = (typeof FIELDS)[number];

const utcGet = {} as Record<Field, Method>;
const utcSet = {} as Record<Field, Method>;
for (const field of FIELDS) {
  utcGet[field] = dateMethods[`getUTC${field}`]!;
  if (field !== "Day") utcSet[field] = dateMethods[`setUTC${field}`]!;
}

/** A spare date whose UTC fields stand in for another date's wall clock. */
const scratch = new NativeDate(0);

/** Point the spare date at a wall clock and read its fields. */
function clock(wall: number): (field: Field) => number {
  nativeSetTime.call(scratch, wall);
  return (field) => utcGet[field].call(scratch) as number;
}

/** Offsets by instant. A date read field by field asks for the same one each time. */
const offsetCache = new Map<number, number>();
const OFFSET_CACHE_SIZE = 1000;

function localOffset(time: number, zone: string): number {
  let offset = offsetCache.get(time);
  if (offset === undefined) {
    if (offsetCache.size >= OFFSET_CACHE_SIZE) offsetCache.clear();
    offset = zoneOffset(time, zone);
    offsetCache.set(time, offset);
  }
  return offset;
}

/** A date's wall clock in the zone, as a UTC time value. NaN for an invalid date. */
function wallOf(date: Date, zone: string): number {
  const time = nativeGetTime.call(date);
  return time + localOffset(time, zone);
}

/**
 * Let `write` edit a date's wall clock on the spare date, then move the date to
 * the instant the edited clock names. The local setters all work this way.
 */
function rewrite(date: Date, zone: string, fromZero: boolean, write: () => void): number {
  const time = nativeGetTime.call(date);
  // setFullYear and setYear start an invalid date over from local 1 January 1970.
  nativeSetTime.call(scratch, Number.isNaN(time) && fromZero ? 0 : time + localOffset(time, zone));
  write();
  return nativeSetTime.call(date, fromWall(nativeGetTime.call(scratch), zone));
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function pad(value: number, length = 2): string {
  return String(value).padStart(length, "0");
}

/** `Sun Mar 08 2026`, the way `toDateString` prints it. */
function dateString(wall: number): string {
  const read = clock(wall);
  const year = read("FullYear");
  const day = `${WEEKDAYS[read("Day")]} ${MONTHS[read("Month")]} ${pad(read("Date"))}`;
  return `${day} ${year < 0 ? "-" : ""}${pad(Math.abs(year), 4)}`;
}

const nameFormats = new Map<string, Intl.DateTimeFormat>();

/** 1 January and 1 July of the year an instant falls in. Standard time has the smaller offset. */
function seasons(time: number): [number, number] {
  const year = new NativeDate(time).getUTCFullYear();
  return [nativeUTC(year, 0, 1), nativeUTC(year, 6, 1)];
}

/**
 * `Eastern Daylight Time`, in the default locale. Engines print the zone's
 * name of today, standard or daylight by the instant's offset, where Intl
 * names an instant by the rules of its own day (`GMT-05:00` in 1900). So the
 * name is read at an instant of this year of the same kind, and only a zone
 * with no daylight time left keeps the name of the instant itself.
 */
function zoneName(time: number, zone: string): string {
  let format = nameFormats.get(zone);
  if (!format) {
    format = new NativeDateTimeFormat(undefined, { timeZone: zone, timeZoneName: "long" });
    nameFormats.set(zone, format);
  }
  const [january, july] = seasons(time);
  const offset = zoneOffset(time, zone);
  const daylight = offset > Math.min(zoneOffset(january, zone), zoneOffset(july, zone));
  let [standard, summer] = seasons(NativeDate.now());
  if (zoneOffset(standard, zone) > zoneOffset(summer, zone)) {
    [standard, summer] = [summer, standard];
  }
  if (!daylight) return zoneNamePart(format, standard);
  const daylightLeft = zoneOffset(summer, zone) !== zoneOffset(standard, zone);
  return zoneNamePart(format, daylightLeft ? summer : time);
}

/** `03:30:00 GMT-0400 (Eastern Daylight Time)`, the way `toTimeString` prints it. */
function timeString(time: number, wall: number, zone: string): string {
  const read = clock(wall);
  const minutes = Math.floor(Math.abs(wall - time) / MINUTE);
  const offset = `${wall < time ? "-" : "+"}${pad(Math.floor(minutes / 60))}${pad(minutes % 60)}`;
  const name = zoneName(time, zone);
  const hms = `${pad(read("Hours"))}:${pad(read("Minutes"))}:${pad(read("Seconds"))}`;
  return `${hms} GMT${offset}${name ? ` (${name})` : ""}`;
}

type Stringify = (time: number, wall: number, zone: string) => string;

const STRINGS: [string, Stringify][] = [
  ["toString", (time, wall, zone) => `${dateString(wall)} ${timeString(time, wall, zone)}`],
  ["toDateString", (_time, wall) => dateString(wall)],
  ["toTimeString", timeString],
];

/** An ISO date with no time, which the spec reads as UTC. */
const ISO_DATE = /^[+-]?\d{4,6}(?:-\d{2}(?:-\d{2})?)?$/;

/** An ISO date and time, the shape that takes a `Z` on the end. */
const ISO_DATE_TIME = /^[+-]?\d{4,6}(?:-\d{2}(?:-\d{2})?)?T\d{2}:\d{2}/i;

/**
 * A string that names its own zone: a trailing `Z`, UTC or GMT, a US zone
 * abbreviation, or a numeric offset after the time. Those name the same
 * instant in every zone, so the engine's own reading stands.
 */
const NAMED_ZONE =
  /\dZ\s*$|\b(?:UTC?|GMT|[ECMP][SD]T)\b|\d:\d{2}(?::\d{2}(?:[.,]\d+)?)?\s*(?:[AP]\.?M\.?\s*)?[+-]\d{1,2}(?::?\d{2})?\b/i;

/** The wall clock a string with no zone spells out, as if it were UTC. */
function wallOfString(text: string, hostTime: number): number {
  for (const suffix of ISO_DATE_TIME.test(text) ? ["Z", " UTC"] : [" UTC", "Z"]) {
    const wall = nativeParse(text + suffix);
    if (!Number.isNaN(wall)) return wall;
  }
  // The engine takes no zone on the end of this one: undo its host zone reading.
  return hostTime - nativeHostOffset.call(new NativeDate(hostTime)) * MINUTE;
}

let zone: string | null = null;
let timePatched = false;

/** `Date.parse`, reading a string with no zone of its own as emulated local time. */
function parse(value: unknown): number {
  const text = String(value);
  const time = nativeParse(text);
  if (!zone || Number.isNaN(time) || ISO_DATE.test(text.trim()) || NAMED_ZONE.test(text)) {
    return time;
  }
  return fromWall(wallOfString(text, time), zone);
}

/** Arguments for the engine's own constructor that name the same instant locally. */
function localArgs(args: unknown[], zone: string): unknown[] {
  if (args.length === 0) return args;
  if (args.length === 1) return typeof args[0] === "string" ? [parse(args[0])] : args;
  // Date.UTC takes the same fields, two digit years included, read as UTC.
  return [fromWall(Reflect.apply(nativeUTC, NativeDate, args), zone)];
}

function withTimeZone(
  options: Intl.DateTimeFormatOptions | undefined,
): Intl.DateTimeFormatOptions | undefined {
  if (!zone) return options;
  if (options?.timeZone) return options;
  return { ...(options ?? {}), timeZone: zone };
}

interface Installed {
  target: object;
  key: string;
  original: unknown;
  value: unknown;
}

let installed: Installed[] = [];

/**
 * Swap one method for `make(original)`, keeping the original for `restoreTime`.
 * It is assigned, not defined: on a member the locale knob holds, that puts it
 * under the locale proxy, which calls through to it. The original is read from
 * under that proxy too, so the locale goes in once.
 */
function install<T>(target: object, key: string, make: (original: T) => T): void {
  if (!Object.getOwnPropertyDescriptor(target, key)) return;
  const original = underLocale(Reflect.get(target, key));
  if (typeof original !== "function") return;
  const value = make(original as T);
  if (Reflect.set(target, key, value)) installed.push({ target, key, original, value });
}

/**
 * Every patch reads the zone on each call and passes straight through without
 * one, so a patch that someone else has since wrapped can stay in place.
 */
function patchTime(): void {
  if (timePatched) return;
  timePatched = true;
  for (const field of FIELDS) {
    install<Method>(
      dateMethods,
      `get${field}`,
      (original) =>
        function (this: Date) {
          if (!zone) return original.call(this);
          return clock(wallOf(this, zone))(field);
        },
    );
    if (field === "Day") continue;
    install<Method>(
      dateMethods,
      `set${field}`,
      (original) =>
        function (this: Date, ...args: unknown[]) {
          if (!zone) return original.apply(this, args);
          return rewrite(this, zone, field === "FullYear", () =>
            utcSet[field].apply(scratch, args),
          );
        },
    );
  }
  install<Method>(
    dateMethods,
    "getTimezoneOffset",
    (original) =>
      function (this: Date) {
        if (!zone) return original.call(this);
        const time = nativeGetTime.call(this);
        if (Number.isNaN(time)) return NaN;
        return offsetMinutes(localOffset(time, zone));
      },
  );
  install<Method>(
    dateMethods,
    "getYear",
    (original) =>
      function (this: Date) {
        if (!zone) return original.call(this);
        return clock(wallOf(this, zone))("FullYear") - 1900;
      },
  );
  install<Method>(
    dateMethods,
    "setYear",
    (original) =>
      function (this: Date, year: unknown) {
        if (!zone) return original.call(this, year);
        return rewrite(this, zone, true, () => {
          const value = Number(year);
          const whole = Math.trunc(value);
          utcSet.FullYear.call(scratch, whole >= 0 && whole <= 99 ? 1900 + whole : value);
        });
      },
  );
  for (const [key, format] of STRINGS) {
    install<Method>(
      dateMethods,
      key,
      (original) =>
        function (this: Date) {
          if (!zone) return original.call(this);
          const time = nativeGetTime.call(this);
          if (Number.isNaN(time)) return "Invalid Date";
          return format(time, time + localOffset(time, zone), zone);
        },
    );
  }
  for (const key of ["toLocaleString", "toLocaleDateString", "toLocaleTimeString"]) {
    install<Method>(
      dateMethods,
      key,
      (original) =>
        function (this: Date, locales?: unknown, options?: unknown) {
          return original.call(this, locales, withTimeZone(options as Intl.DateTimeFormatOptions));
        },
    );
  }
  // The constructor is wrapped only for what the prototype cannot reach: dates
  // built from local fields or parsed from strings. The prototype is the same
  // object, so `instanceof Date` holds for dates from before the patch too.
  install<DateConstructor>(
    globalThis,
    "Date",
    (original) =>
      new Proxy(original, {
        construct(target, args: unknown[], newTarget) {
          return Reflect.construct(target, zone ? localArgs(args, zone) : args, newTarget);
        },
        apply(target, thisArg, args: unknown[]) {
          if (!zone) return Reflect.apply(target, thisArg, args);
          return String(new NativeDate());
        },
        get(target, key, receiver) {
          return key === "parse" ? parse : Reflect.get(target, key, receiver);
        },
      }),
  );
  install<DateConstructor>(dateMethods, "constructor", () => globalThis.Date);
  install<typeof Intl.DateTimeFormat>(
    Intl,
    "DateTimeFormat",
    (original) =>
      new Proxy(original, {
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
      }),
  );
  // Temporal reads the system zone only through Now, and only without a zone argument.
  const now = (globalThis as { Temporal?: { Now?: object } }).Temporal?.Now;
  if (!now) return;
  install<NowMethod>(
    now,
    "timeZoneId",
    (original) =>
      function (this: unknown) {
        return zone ?? original.call(this);
      },
  );
  for (const key of ["zonedDateTimeISO", "plainDateTimeISO", "plainDateISO", "plainTimeISO"]) {
    install<NowMethod>(
      now,
      key,
      (original) =>
        function (this: unknown, timeZone?: unknown) {
          return original.call(this, timeZone === undefined && zone ? zone : timeZone);
        },
    );
  }
}

function restoreTime(): void {
  if (!timePatched) return;
  for (const { target, key, original, value } of installed.reverse()) {
    // Wrapped by someone else since: leave theirs, ours passes through now.
    if (underLocale(Reflect.get(target, key)) !== value) continue;
    Reflect.set(target, key, original);
  }
  installed = [];
  timePatched = false;
}

/** Emulate an IANA zone, or hand the host zone back for null. */
export function apply(value: string | null): void {
  const next = value ? canonicalZone(value) : null;
  if (next !== zone) offsetCache.clear();
  zone = next;
  if (!zone) {
    restoreTime();
    return;
  }
  patchTime();
}

export function reset(): void {
  zone = null;
  offsetCache.clear();
  restoreTime();
}
