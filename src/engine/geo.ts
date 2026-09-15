import type { GeoValue } from "../types";

export interface GeoPreset {
  id: string;
  label: string;
  lat: number;
  lng: number;
  timeZone: string;
}

export const GEO_PRESETS: GeoPreset[] = [
  { id: "antalya", label: "Antalya", lat: 36.8969, lng: 30.7133, timeZone: "Europe/Istanbul" },
  { id: "istanbul", label: "Istanbul", lat: 41.0082, lng: 28.9784, timeZone: "Europe/Istanbul" },
  { id: "berlin", label: "Berlin", lat: 52.52, lng: 13.405, timeZone: "Europe/Berlin" },
  { id: "london", label: "London", lat: 51.5074, lng: -0.1278, timeZone: "Europe/London" },
  { id: "new-york", label: "New York", lat: 40.7128, lng: -74.006, timeZone: "America/New_York" },
  {
    id: "san-francisco",
    label: "San Francisco",
    lat: 37.7749,
    lng: -122.4194,
    timeZone: "America/Los_Angeles",
  },
  { id: "tokyo", label: "Tokyo", lat: 35.6762, lng: 139.6503, timeZone: "Asia/Tokyo" },
  { id: "sydney", label: "Sydney", lat: -33.8688, lng: 151.2093, timeZone: "Australia/Sydney" },
  {
    id: "sao-paulo",
    label: "Sao Paulo",
    lat: -23.5505,
    lng: -46.6333,
    timeZone: "America/Sao_Paulo",
  },
];

export const DEFAULT_ACCURACY = 20;

export interface GeoFix {
  lat: number;
  lng: number;
  accuracy: number;
  timeZone: string;
}

export function geoPreset(id: string): GeoPreset | undefined {
  return GEO_PRESETS.find((preset) => preset.id === id);
}

/** The position to report, or null when the knob is off or the preset is unknown. */
export function resolveGeo(value: GeoValue): GeoFix | null {
  const accuracy = value.accuracy > 0 ? value.accuracy : DEFAULT_ACCURACY;
  if (value.preset === "custom") {
    return { lat: value.lat, lng: value.lng, accuracy, timeZone: value.timeZone };
  }
  const preset = geoPreset(value.preset);
  if (!preset) return null;
  return { lat: preset.lat, lng: preset.lng, accuracy, timeZone: preset.timeZone };
}

const NativeDateTimeFormat = Intl.DateTimeFormat;

/**
 * Minutes to add to local time to get UTC, the way `getTimezoneOffset` reports
 * it: Europe/Istanbul is -180, America/New_York in winter is 300.
 */
export function offsetMinutesFor(
  date: Date,
  timeZone: string,
  DateTimeFormat: typeof Intl.DateTimeFormat = NativeDateTimeFormat,
): number {
  try {
    const parts = new DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "longOffset",
    }).formatToParts(date);
    const name = parts.find((part) => part.type === "timeZoneName")?.value ?? "";
    const match = /GMT([+-])(\d{1,2})(?::?(\d{2}))?/.exec(name);
    if (match) {
      const sign = match[1] === "+" ? 1 : -1;
      const hours = Number(match[2]);
      const minutes = Number(match[3] ?? 0);
      const east = sign * (hours * 60 + minutes);
      return east === 0 ? 0 : -east;
    }
    if (name === "GMT" || name === "UTC") return 0;
  } catch {
    // Fall through to the parts based reading.
  }
  return offsetFromParts(date, timeZone, DateTimeFormat);
}

function offsetFromParts(
  date: Date,
  timeZone: string,
  DateTimeFormat: typeof Intl.DateTimeFormat,
): number {
  try {
    const parts = new DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(date);
    const read = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
    const wall = Date.UTC(
      read("year"),
      read("month") - 1,
      read("day"),
      read("hour") % 24,
      read("minute"),
      read("second"),
    );
    return Math.round((date.getTime() - wall) / 60000);
  } catch {
    return 0;
  }
}

const FAKE_WATCH_BASE = 1_000_000;

let fix: GeoFix | null = null;
let nextWatchId = FAKE_WATCH_BASE;
let geolocationDescriptors: Record<string, PropertyDescriptor | undefined> | null = null;
let nativeGeolocation: {
  getCurrentPosition: Geolocation["getCurrentPosition"];
  watchPosition: Geolocation["watchPosition"];
  clearWatch: Geolocation["clearWatch"];
} | null = null;
let nativeGetTimezoneOffset: (this: Date) => number = Date.prototype.getTimezoneOffset;
let timePatched = false;

function currentPosition(): GeolocationPosition {
  const value = fix!;
  return {
    coords: {
      latitude: value.lat,
      longitude: value.lng,
      accuracy: value.accuracy,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
    },
    timestamp: Date.now(),
  } as unknown as GeolocationPosition;
}

function patchGeolocation(): void {
  const geolocation = navigator.geolocation;
  if (!geolocation) return;
  if (!nativeGeolocation) {
    nativeGeolocation = {
      getCurrentPosition: geolocation.getCurrentPosition,
      watchPosition: geolocation.watchPosition,
      clearWatch: geolocation.clearWatch,
    };
    geolocationDescriptors = {
      getCurrentPosition: Object.getOwnPropertyDescriptor(geolocation, "getCurrentPosition"),
      watchPosition: Object.getOwnPropertyDescriptor(geolocation, "watchPosition"),
      clearWatch: Object.getOwnPropertyDescriptor(geolocation, "clearWatch"),
    };
  }
  geolocation.getCurrentPosition = (success: PositionCallback) => {
    setTimeout(() => success(currentPosition()), 0);
  };
  geolocation.watchPosition = (success: PositionCallback) => {
    const id = ++nextWatchId;
    setTimeout(() => success(currentPosition()), 0);
    return id;
  };
  geolocation.clearWatch = (id: number) => {
    if (id > FAKE_WATCH_BASE) return;
    nativeGeolocation?.clearWatch.call(geolocation, id);
  };
}

function restoreGeolocation(): void {
  const geolocation = navigator.geolocation;
  if (!geolocation || !nativeGeolocation || !geolocationDescriptors) return;
  for (const [name, descriptor] of Object.entries(geolocationDescriptors)) {
    if (descriptor) Object.defineProperty(geolocation, name, descriptor);
    else delete (geolocation as unknown as Record<string, unknown>)[name];
  }
  nativeGeolocation = null;
  geolocationDescriptors = null;
}

function withTimeZone(
  options: Intl.DateTimeFormatOptions | undefined,
): Intl.DateTimeFormatOptions | undefined {
  if (!fix?.timeZone) return options;
  if (options?.timeZone) return options;
  return { ...(options ?? {}), timeZone: fix.timeZone };
}

function patchTime(): void {
  if (!fix?.timeZone) {
    restoreTime();
    return;
  }
  if (timePatched) return;
  nativeGetTimezoneOffset = Date.prototype.getTimezoneOffset;
  Date.prototype.getTimezoneOffset = function getTimezoneOffset(this: Date): number {
    if (!fix?.timeZone) return nativeGetTimezoneOffset.call(this);
    return offsetMinutesFor(this, fix.timeZone);
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

export function apply(value: GeoValue): void {
  fix = resolveGeo(value);
  if (!fix) {
    reset();
    return;
  }
  patchGeolocation();
  patchTime();
}

export function reset(): void {
  fix = null;
  restoreTime();
  restoreGeolocation();
}
