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

const FAKE_WATCH_BASE = 1_000_000;

let fix: GeoFix | null = null;
let nextWatchId = FAKE_WATCH_BASE;
let geolocationDescriptors: Record<string, PropertyDescriptor | undefined> | null = null;
let nativeGeolocation: {
  getCurrentPosition: Geolocation["getCurrentPosition"];
  watchPosition: Geolocation["watchPosition"];
  clearWatch: Geolocation["clearWatch"];
} | null = null;

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

export function apply(value: GeoValue): void {
  fix = resolveGeo(value);
  if (!fix) {
    reset();
    return;
  }
  patchGeolocation();
}

export function reset(): void {
  fix = null;
  restoreGeolocation();
}
