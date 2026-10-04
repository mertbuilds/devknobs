import type { GeoErrorValue, GeoValue } from "../types";
import { realNow } from "./clock";

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

/** The `route` preset's pace, in km/h: a car in town. */
export const DEFAULT_SPEED = 40;

/** How often a playing route moves the position active watches hear, in ms. */
const ROUTE_TICK = 1000;

const EARTH_RADIUS = 6_371_008.8;

export interface GeoFix {
  lat: number;
  lng: number;
  accuracy: number;
  timeZone: string;
}

export function geoPreset(id: string): GeoPreset | undefined {
  return GEO_PRESETS.find((preset) => preset.id === id);
}

export interface RoutePoint {
  lat: number;
  lng: number;
}

/**
 * The points of a route: the track points of a GPX file, else its route
 * points, else its way points, or else one `lat,lng` pair per line. Points
 * off the globe are dropped.
 */
export function parseRoute(text: string): RoutePoint[] {
  const points: RoutePoint[] = [];
  const add = (lat: number, lng: number) => {
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) points.push({ lat, lng });
  };
  for (const tag of ["trkpt", "rtept", "wpt"]) {
    for (const [, attributes = ""] of text.matchAll(new RegExp(`<${tag}\\b([^>]*)>`, "gi"))) {
      const lat = /\blat\s*=\s*["']([^"']*)["']/i.exec(attributes)?.[1] ?? "";
      const lng = /\blon\s*=\s*["']([^"']*)["']/i.exec(attributes)?.[1] ?? "";
      add(parseFloat(lat), parseFloat(lng));
    }
    if (points.length > 0) return points;
  }
  for (const line of text.split(/[\n;]+/)) {
    const match = /(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)/.exec(line);
    if (match) add(Number(match[1]), Number(match[2]));
  }
  return points;
}

function radians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Great circle distance between two points, in meters. */
export function distance(from: RoutePoint, to: RoutePoint): number {
  const lat = Math.sin(radians(to.lat - from.lat) / 2);
  const lng = Math.sin(radians(to.lng - from.lng) / 2);
  const a = lat * lat + Math.cos(radians(from.lat)) * Math.cos(radians(to.lat)) * lng * lng;
  return 2 * EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** The compass heading from one point toward another, in degrees clockwise from north. */
function bearing(from: RoutePoint, to: RoutePoint): number {
  const lng = radians(to.lng - from.lng);
  const y = Math.sin(lng) * Math.cos(radians(to.lat));
  const x =
    Math.cos(radians(from.lat)) * Math.sin(radians(to.lat)) -
    Math.sin(radians(from.lat)) * Math.cos(radians(to.lat)) * Math.cos(lng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/**
 * Where a trip along the route stands after `meters`, and the heading it
 * travels on. It starts over from the first point once it reaches the last.
 * Straight in latitude and longitude between points, which at the scale of a
 * track is as good as the great circle. A route that goes nowhere has no heading.
 */
export function alongRoute(points: RoutePoint[], meters: number): RoutePoint & { heading: number } {
  const legs = points.slice(1).map((to, index) => distance(points[index]!, to));
  const total = legs.reduce((sum, leg) => sum + leg, 0);
  const first = points[0] ?? { lat: 0, lng: 0 };
  if (!(total > 0)) return { ...first, heading: NaN };
  let left = ((meters % total) + total) % total;
  let last = 0;
  for (const [index, leg] of legs.entries()) {
    if (leg === 0) continue;
    last = index;
    if (left > leg) {
      left -= leg;
      continue;
    }
    const from = points[index]!;
    const to = points[index + 1]!;
    const share = left / leg;
    return {
      lat: from.lat + (to.lat - from.lat) * share,
      lng: from.lng + (to.lng - from.lng) * share,
      heading: bearing(from, to),
    };
  }
  // Rounding left a sliver past the last leg: that is its end.
  return { ...points[last + 1]!, heading: bearing(points[last]!, points[last + 1]!) };
}

/** The position to report, or null when the knob is off or the preset is unknown. */
export function resolveGeo(value: GeoValue): GeoFix | null {
  const accuracy = value.accuracy > 0 ? value.accuracy : DEFAULT_ACCURACY;
  if (value.preset === "custom") {
    return { lat: value.lat, lng: value.lng, accuracy, timeZone: value.timeZone };
  }
  if (value.preset === "route") {
    const [start] = parseRoute(value.route);
    if (!start) return null;
    return { lat: start.lat, lng: start.lng, accuracy, timeZone: value.timeZone };
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
/**
 * The trip the route preset is on: its points, its pace in m/s, and since when
 * in real time, so the clock knob leaves the pace alone.
 */
let trip: { points: RoutePoint[]; speed: number; start: number } | null = null;
let ticker: ReturnType<typeof setInterval> | null = null;
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
  let { lat, lng } = value;
  let heading: number | null = null;
  let speed: number | null = null;
  if (trip) {
    const at = alongRoute(trip.points, (trip.speed * (realNow() - trip.start)) / 1000);
    ({ lat, lng } = at);
    speed = trip.speed;
    // The spec's heading for a device standing still.
    heading = speed > 0 ? at.heading : NaN;
  }
  return {
    coords: {
      latitude: lat,
      longitude: lng,
      accuracy: value.accuracy,
      altitude: null,
      altitudeAccuracy: null,
      heading,
      speed,
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

/** Every watch hears where it is now. */
function pushWatches(): void {
  cached = null;
  for (const [id, request] of watches) respond(request, id);
}

/** Keep the watches moving while a route plays, and only then. */
function playRoute(): void {
  const playing = trip !== null && failure === "none";
  if (playing && !ticker) ticker = setInterval(pushWatches, ROUTE_TICK);
  if (!playing && ticker) {
    clearInterval(ticker);
    ticker = null;
  }
}

export function apply(value: GeoValue): void {
  const next = resolveGeo(value);
  const error = value.error;
  if (!next && error === "none") {
    reset();
    return;
  }
  const route = value.preset === "route" ? [value.route, value.speed] : null;
  const key = JSON.stringify([next, error, route]);
  const moved = key !== applied;
  fix = next;
  failure = error;
  applied = key;
  patchGeolocation();
  patchPermissions();
  if (!moved) return;
  // A new route, or a new pace, starts the trip over.
  trip =
    route && next
      ? {
          points: parseRoute(value.route),
          speed: Math.max(0, value.speed) / 3.6,
          start: realNow(),
        }
      : null;
  playRoute();
  pushWatches();
  notifyStatuses();
}

/** Stop emulating. Watches started meanwhile end here: the device never heard of them. */
export function reset(): void {
  fix = null;
  failure = "none";
  applied = "";
  cached = null;
  trip = null;
  playRoute();
  watches.clear();
  restorePermissions();
  restoreGeolocation();
}
