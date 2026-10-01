import type { GeoErrorValue, GeoValue } from "../types";

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

/** The `code` of a `GeolocationPositionError` for each failure. */
export const GEO_ERROR_CODES = { denied: 1, unavailable: 2, timeout: 3 } as const;

type ErrorCode = (typeof GEO_ERROR_CODES)[keyof typeof GEO_ERROR_CODES];

/** Chrome's messages. */
const ERROR_MESSAGES: Record<ErrorCode, string> = {
  1: "User denied Geolocation",
  2: "Position update is unavailable",
  3: "Timeout expired",
};

/**
 * An error the page reads like the real one: the code, the message and the
 * code constants, and `instanceof GeolocationPositionError` where it exists.
 */
export function positionError(code: ErrorCode): GeolocationPositionError {
  const proto =
    typeof GeolocationPositionError === "function"
      ? GeolocationPositionError.prototype
      : Object.prototype;
  return Object.create(proto, {
    code: { value: code, enumerable: true },
    message: { value: ERROR_MESSAGES[code], enumerable: true },
    PERMISSION_DENIED: { value: 1 },
    POSITION_UNAVAILABLE: { value: 2 },
    TIMEOUT: { value: 3 },
  }) as GeolocationPositionError;
}

interface Request {
  success: PositionCallback;
  error?: PositionErrorCallback | null;
  options?: PositionOptions;
}

let fix: GeoFix | null = null;
let failure: GeoErrorValue = "none";
/** What the last apply emulated, so that a knob that did not move pushes nothing. */
let applied = "";
/** The last position handed out, which `maximumAge` may hand out again. */
let cached: GeolocationPosition | null = null;
const watches = new Map<number, Request>();
let nextWatchId = FAKE_WATCH_BASE;
let geolocationDescriptors: Record<string, PropertyDescriptor | undefined> | null = null;
let nativeGeolocation: {
  getCurrentPosition: Geolocation["getCurrentPosition"];
  watchPosition: Geolocation["watchPosition"];
  clearWatch: Geolocation["clearWatch"];
} | null = null;
let nativeQuery: Permissions["query"] | null = null;
let queryDescriptor: PropertyDescriptor | undefined;
/** Geolocation permission statuses handed out while emulating, with the state each last reported. */
const statuses = new Map<PermissionStatus, PermissionState>();

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

/**
 * The position to hand out: the last one while `maximumAge` allows it, a fresh
 * one otherwise, and none when `timeout: 0` leaves no time to get one.
 */
function positionFor(options: PositionOptions | undefined): GeolocationPosition | null {
  const maximumAge = options?.maximumAge ?? 0;
  if (cached && Date.now() - cached.timestamp <= maximumAge) return cached;
  if (options?.timeout === 0) return null;
  cached = currentPosition();
  return cached;
}

/**
 * Answer a request a task later, the way the device would. A timeout failure
 * only fires once `options.timeout` runs out, so without one it never does,
 * like a fix that never comes. A watch cleared in between hears nothing.
 */
function respond(request: Request, watchId?: number): void {
  const later = (delay: number, run: () => void) => {
    setTimeout(() => {
      if (watchId === undefined || watches.has(watchId)) run();
    }, delay);
  };
  const fail = (code: ErrorCode, delay = 0) => {
    later(delay, () => request.error?.(positionError(code)));
  };
  if (failure === "timeout") {
    const timeout = request.options?.timeout;
    if (typeof timeout === "number" && timeout >= 0 && Number.isFinite(timeout)) {
      fail(GEO_ERROR_CODES.timeout, timeout);
    }
    return;
  }
  if (failure !== "none") {
    fail(GEO_ERROR_CODES[failure]);
    return;
  }
  const position = positionFor(request.options);
  if (position) later(0, () => request.success(position));
  else fail(GEO_ERROR_CODES.timeout);
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
  geolocation.getCurrentPosition = (success, error, options) => {
    respond({ success, error, options });
  };
  geolocation.watchPosition = (success, error, options) => {
    const id = ++nextWatchId;
    watches.set(id, { success, error, options });
    respond({ success, error, options }, id);
    return id;
  };
  geolocation.clearWatch = (id: number) => {
    if (watches.delete(id)) return;
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

/** What the permission reads while emulating: a fix needs no prompt, a refusal is final. */
function permissionState(): PermissionState {
  return failure === "denied" ? "denied" : "granted";
}

/** Give a status the emulated state, for as long as the emulation runs. */
function track(status: PermissionStatus): PermissionStatus {
  if (!statuses.has(status)) {
    const proto: object = Object.getPrototypeOf(status);
    Object.defineProperty(status, "state", {
      configurable: true,
      get: () => (nativeQuery ? permissionState() : Reflect.get(proto, "state", status)),
    });
  }
  statuses.set(status, status.state);
  return status;
}

/** Fire `change` on every status whose state moved since it last reported. */
function notifyStatuses(): void {
  for (const [status, reported] of statuses) {
    const state = status.state;
    if (state === reported) continue;
    statuses.set(status, state);
    status.dispatchEvent(new Event("change"));
  }
}

function patchPermissions(): void {
  const permissions = navigator.permissions;
  if (!permissions || nativeQuery) return;
  const query = permissions.query;
  nativeQuery = query;
  queryDescriptor = Object.getOwnPropertyDescriptor(permissions, "query");
  permissions.query = (descriptor: PermissionDescriptor) => {
    const status = query.call(permissions, descriptor);
    return descriptor?.name === "geolocation" ? status.then(track) : status;
  };
}

function restorePermissions(): void {
  const permissions = navigator.permissions;
  if (!permissions || !nativeQuery) return;
  if (queryDescriptor) Object.defineProperty(permissions, "query", queryDescriptor);
  else Reflect.deleteProperty(permissions, "query");
  nativeQuery = null;
  queryDescriptor = undefined;
  for (const status of statuses.keys()) Reflect.deleteProperty(status, "state");
  notifyStatuses();
  statuses.clear();
}

export function apply(value: GeoValue): void {
  const next = resolveGeo(value);
  const error = value.error;
  if (!next && error === "none") {
    reset();
    return;
  }
  const key = JSON.stringify([next, error]);
  const moved = key !== applied;
  fix = next;
  failure = error;
  applied = key;
  patchGeolocation();
  patchPermissions();
  if (!moved) return;
  cached = null;
  for (const [id, request] of watches) respond(request, id);
  notifyStatuses();
}

/** Stop emulating. Watches started meanwhile end here: the device never heard of them. */
export function reset(): void {
  fix = null;
  failure = "none";
  applied = "";
  cached = null;
  watches.clear();
  restorePermissions();
  restoreGeolocation();
}
