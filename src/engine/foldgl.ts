import {
  blurOn,
  blurShare,
  darkAt,
  type FoldShots,
  freeDepth,
  type Pane,
  type Quad,
  shadeOf,
  shadesOn,
  shotPane,
  shotPicture,
  shotQuad,
  shotWindow,
  turnBlur,
  uvOf,
  WIPE,
} from "./fold";
import { tune } from "./foldtune";
import type { Rect } from "./mock";

/**
 * The page on the screen of a fold's half that turns, drawn by WebGL2 from
 * a picture of it, as Apple and jadon7/iphone-duo draw theirs: blurred from
 * the hinge toward the free edge as the hinge sets it, none at the hinge,
 * and toward the picture's ends along the hinge, where the turned screen
 * reaches past it. A blur never darkens: the black past the picture's ends,
 * and past the turned screen's free edge, where the page is cut off as it
 * is seen, is no part of it, so the picture keeps its colour up to its own
 * outline, which stays sharp. The blur is the picture's
 * mipmaps, sampled 25 times about each point as far apart as it is wide,
 * and where there is no blur, all on the point.
 * Its shades are worked out there too, at every px.
 * The picture goes up once as the fold starts, and each frame sets only a
 * few numbers and draws one quad. Where WebGL2 is not, the page's blurrier
 * pictures are laid over each other instead.
 */

/** How the screen is blurred with the hinge where it is, in the picture's css px. */
export interface ScreenLook {
  /** How wide the blur at the turned screen's free edge is, as `turnBlur` has it. */
  peak: number;
  /** How wide the blur at the picture's ends is, at the hinge and at the free edge. */
  edge: [hinge: number, free: number];
  /** Where the turned screen's free edge is seen on the picture, as a share of the way from the hinge to its own. */
  free: number;
  /** How deep the dark at the turned screen's free edge is, as `freeDepth` has it. */
  dark: number;
  /** What shades the screen, as `shadeOf` has it, but the screen's own light, which lies over the canvas as it does over the other half: nothing where gradients over the canvas shade it. */
  lit: [wipe: number, area: number, far: number];
}

/**
 * How the turned screen is blurred with the hinge `open` of the way open,
 * reaching `wedge` css px past the picture's ends at its free edge, and its
 * free edge seen `free` of the way from the hinge to the picture's. It is
 * shaded as the screen of `shaded` is, or not at all, null, where gradients
 * over the canvas shade it, and blurred as the screen of `pane` is.
 */
export function screenLook(
  open: number,
  wedge: number,
  free = 1,
  shaded: Pane | null = null,
  pane: Pane = shaded ?? "inner",
): ScreenLook {
  const blurred = blurOn();
  const [, wipe, area, far] = shaded ? shadeOf(shaded, open, free) : [1, 0, 0, 0];
  return {
    peak: blurred ? turnBlur(open, pane) : 0,
    edge: blurred ? [tune.edgeHinge * wedge, tune.edgeFree * wedge] : [0, 0],
    free,
    dark: shadesOn() ? freeDepth(open) : 0,
    lit: [wipe, area, far],
  };
}

/**
 * How much of its light the screen of `pane` keeps `t` of the way from the
 * hinge to the picture's free edge, shaded as `look` has it, as shown: the
 * wipe, the dark of Apple's blurs and the far side's shadow, worked out only
 * where one is on. Past where the turned screen is cut, as much as there, as
 * a gradient's last stop goes on.
 */
export function shadeAt(pane: Pane, look: ScreenLook, across: number): number {
  const t = Math.min(across, look.free);
  const [wipe, area, far] = look.lit;
  if (wipe + area + far <= 0) return 1;
  const { at, shade, blur } = WIPE[pane];
  const uv = uvOf(pane, t);
  const off = Math.abs(uv - at);
  const wiped = 1 - clamp(smoothstep(shade[0], shade[1], off) * wipe);
  const soft = 1 - smoothstep(0.9, 1.3, Math.min(4 / 3, Math.max(0, ((off - blur[0]) / (blur[1] - blur[0])) * area)));
  const shadowed = 1 + (smoothstep(0.05, 0.5, uv) - 1) * far;
  return clamp(wiped * soft * soft * shadowed) ** (1 / 2.2);
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * How wide the blur is, in css px, `t` of the way from the hinge to the free
 * edge, `inside` css px in from the picture's nearer end along the hinge,
 * less than 0 past it: least at the hinge and most at the turned screen's
 * free edge, as `blurShare` has it, or the ends', whichever is the wider.
 */
export function blurAt(look: ScreenLook, t: number, inside: number): number {
  const wipe = look.peak * blurShare(look.free > 0 ? Math.min(1, t / look.free) : 1);
  const rim = look.edge[0] + (look.edge[1] - look.edge[0]) * t;
  if (rim <= 0) return wipe;
  return Math.max(wipe, rim * (1 - smoothstep(0, tune.edgeReach * rim, inside)));
}

/** The share of a blurred point each of its taps takes, by how many taps it is from the middle one, each way: a row's five add up to 1. */
export const WEIGHTS = [0.375, 0.25, 0.0625] as const;

/**
 * The picture's level a point needs with no blur at all, as the hardware
 * picks it by itself: a px of the canvas to its `right` and one `down` are
 * that many of the picture's px away. 0 where the picture is no denser than
 * the canvas.
 */
export function sharpLevel(right: [number, number], down: [number, number]): number {
  return 0.5 * Math.log2(Math.max(1, right[0] ** 2 + right[1] ** 2, down[0] ** 2 + down[1] ** 2));
}

/**
 * The picture's level the taps `gap` css px apart are taken from, the
 * picture `texels` of its px to a css px: a tap's own px as wide as the gap,
 * and never sharper than `sharp`, the level with no blur. It has no step
 * anywhere in `gap`, so nowhere on the screen does the picture change level
 * at once.
 */
export function levelAt(gap: number, texels: number, sharp: number): number {
  return Math.max(sharp, Math.log2(Math.max(1, gap * texels)));
}

/** The least of the picture a point's taps have between them that their sum is divided by. */
const LEAST = 1e-4;

/**
 * What the shader's 25 taps about a point come to, `gap` apart, each read
 * by `sample`: with no gap they all fall on the point, so it is the point's
 * own, sharp. A tap counts by how much of the picture there is at it, as
 * `seen` has it, softened as far as the blur is wide, and what they add up
 * to is divided by how much they have between them, so a tap past the
 * picture takes nothing from the point's colour. Only how much of the
 * picture is at the point itself, softened over half a px, `px` css px wide,
 * takes from it: its outline.
 */
export function tapped(
  sample: (x: number, y: number) => number,
  x: number,
  y: number,
  gap: number,
  seen: (x: number, y: number, soft: number) => number = () => 1,
  px = 1,
): number {
  const soft = Math.max(0.5 * px, 0.75 * gap);
  let sum = 0;
  let had = 0;
  for (let down = -2; down <= 2; down++) {
    for (let right = -2; right <= 2; right++) {
      const at: [number, number] = [x + right * gap, y + down * gap];
      const share = seen(...at, soft) * (WEIGHTS[Math.abs(right)] ?? 0) * (WEIGHTS[Math.abs(down)] ?? 0);
      sum += sample(...at) * share;
      had += share;
    }
  }
  return (sum / Math.max(had, LEAST)) * seen(x, y, 0.5 * px);
}

/** How much of the picture there is `at` css px along a picture `span` long, softened over `soft` either way: none past its ends. */
export function coverage(at: number, span: number, soft: number): number {
  return smoothstep(-soft, soft, at) * (1 - smoothstep(span - soft, span + soft, at));
}

function smoothstep(from: number, to: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - from) / (to - from)));
  return t * t * (3 - 2 * t);
}

/**
 * How far the turned screen of `pane` reaches past the picture's ends at its
 * free edge, in the picture's css px, as `darkAt` has it: the picture
 * `span` css px long along the hinge.
 */
export function wedgeOf(window: Quad, pane: Pane, picture: Rect, span: number): number {
  const { top, bottom } = darkAt(window, pane, picture);
  return picture.height > 0 ? (Math.max(top, bottom) * span) / picture.height : 0;
}

/**
 * Where the turned screen of `pane`, its window `window`, is seen to end on
 * its `picture` at its free edge, as a share of the way from the hinge to
 * the picture's own, 1 where it reaches it: the window cuts the page lying
 * flat there, so the page ends at that cut, as at its ends.
 */
export function freeOf(window: Quad, pane: Pane, picture: Rect): number {
  if (picture.width <= 0) return 1;
  const [a, b, c, d] = window;
  const seen = pane === "inner" ? picture.x + picture.width - (a[0] + d[0]) / 2 : (b[0] + c[0]) / 2 - picture.x;
  return Math.min(1, Math.max(0, seen / picture.width));
}

/** How far, at most, the turned screen of `pane` reaches past the picture's ends in any of the fold's frames, as a share of its length. */
export function reachOf(shots: FoldShots, pane: Pane): number {
  let most = 0;
  for (const shot of shots.frames) {
    if (shotPane(shots, shot) !== pane) continue;
    const quad = shotQuad(shot, pane);
    const picture = shotPicture(shots, pane, quad);
    most = Math.max(most, wedgeOf(shotWindow(quad, pane, picture), pane, picture, 1));
  }
  return most;
}

/** Where the screen's picture is drawn, in the css px of the whole screen it is a picture of. */
export interface ScreenPlace {
  pane: Pane;
  /** Does the hinge run down the screen, so its ends along the hinge are its top and bottom. */
  across: boolean;
  /** The whole screen's size, which the picture is of, and the part of it that turns, in its css px. */
  stage: { width: number; height: number };
  part: Rect;
  /** How far past the screen's ends along the hinge the turned screen may reach, in css px. */
  margin: number;
  /** How many of the display's px a css px of the picture takes. */
  density: number;
}

/** Where the canvas lies on the whole screen: over the part that turns, and `margin` past its ends along the hinge. */
export function canvasRect(place: ScreenPlace): Rect {
  const { across, part, stage, margin } = place;
  return across
    ? { x: part.x, y: -margin, width: part.width, height: stage.height + 2 * margin }
    : { x: -margin, y: part.y, width: stage.width + 2 * margin, height: part.height };
}

/** How far a point of the whole screen is from the hinge to the free edge, 0 to 1, as `a x + b y + c`. */
export function hingeLine(pane: Pane, across: boolean, part: Rect): [number, number, number] {
  const { x, y, width, height } = part;
  if (across) return pane === "inner" ? [-1 / width, 0, (x + width) / width] : [1 / width, 0, -x / width];
  return pane === "inner" ? [0, 1 / height, -y / height] : [0, -1 / height, (y + height) / height];
}

/** A canvas's WebGL2 context, or null where it has none: a context of another kind, or none at all. */
export function contextOf(canvas: {
  getContext(id: "webgl2", options?: WebGLContextAttributes): unknown;
}): WebGL2RenderingContext | null {
  if (typeof WebGL2RenderingContext === "undefined") return null;
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    powerPreference: "low-power",
  });
  return gl instanceof WebGL2RenderingContext ? gl : null;
}

const VERTEX = `#version 300 es
in vec2 corner;
uniform vec4 view;
out vec2 pos;
void main() {
  pos = view.xy + corner * view.zw;
  gl_Position = vec4(corner.x * 2.0 - 1.0, 1.0 - corner.y * 2.0, 0.0, 1.0);
}`;

/**
 * `blurAt`, `coverage` and `tapped`, the same: the picture blurred with none
 * of the black past it, which lies past its ends along the hinge and past
 * where the turned screen's free edge cuts it, then cut to its own outline,
 * and darkened toward that edge
 * as `freeDark` has it, and shaded as `shadeAt` has it: each at every px, so
 * no shade has stops to bend at. A shade that is off costs a compare. What
 * varies gets a little noise, under a step of the screen's 256, so a dark,
 * slow shade shows no bands. What `tune` has comes in as uniforms, so a
 * number changed by hand shows at the next draw.
 * Every px goes one way through it: the same taps from a level that
 * `levelAt` has, which close onto the point as the blur goes to none. A px
 * that took another way than the next one, by how wide its blur is, drew a
 * line where they met, which moved with the fold. Only a draw with no blur
 * anywhere takes one tap, and what says so is the same for all of its px.
 */
export const FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D page;
uniform vec2 stage;
uniform vec2 along;
uniform vec3 line;
uniform float peak;
uniform vec2 edge;
uniform float free;
uniform float dark;
uniform vec2 shape;
uniform vec2 rimmed;
uniform vec3 band;
uniform vec3 lit;
uniform vec2 run;
uniform vec3 wiped;
uniform vec2 soften;
uniform float grain;
uniform float px;
in vec2 pos;
out vec4 color;
const float WEIGHTS[3] = float[3](${WEIGHTS.join(", ")});
float cover(float at, float span, float soft) {
  return smoothstep(-soft, soft, at) * (1.0 - smoothstep(span - soft, span + soft, at));
}
float shadow(float t) {
  if (dark <= 0.0) return 1.0;
  float across = t / max(free, 0.001);
  float deep = band.z * smoothstep(band.x, 1.0, across) + (1.0 - band.z) * smoothstep(1.0 - band.y, 1.0, across);
  return 1.0 - dark * deep;
}
float shade(float t) {
  if (lit.x + lit.y + lit.z <= 0.0) return 1.0;
  float uv = run.x + run.y * t;
  float off = abs(uv - wiped.x);
  float wipe = 1.0 - clamp(smoothstep(wiped.y, wiped.z, off) * lit.x, 0.0, 1.0);
  float soft = 1.0 - smoothstep(0.9, 1.3, clamp((off - soften.x) / (soften.y - soften.x) * lit.y, 0.0, 4.0 / 3.0));
  float away = mix(1.0, smoothstep(0.05, 0.5, uv), lit.z);
  return pow(clamp(wipe * soft * soft * away, 0.0, 1.0), 1.0 / 2.2);
}
vec4 shaded(vec3 rgb, float t) {
  float speck = 0.0;
  if (grain > 0.0 && dark + lit.x + lit.y + lit.z > 0.0) {
    speck = (fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) - 0.5) * grain / 255.0;
  }
  return vec4(rgb * shadow(t) * shade(min(t, free)) + speck, 1.0);
}
float seen(vec2 at, float soft) {
  float reach = soft * length(line.xy);
  return cover(dot(along, at), dot(along, stage), soft) * (1.0 - smoothstep(free - reach, free + reach, dot(line.xy, at) + line.z));
}
void main() {
  vec2 texels = vec2(textureSize(page, 0)) / stage;
  vec2 right = dFdx(pos) * texels;
  vec2 down = dFdy(pos) * texels;
  float sharp = 0.5 * log2(max(1.0, max(dot(right, right), dot(down, down))));
  float t = clamp(dot(line.xy, pos) + line.z, 0.0, 1.0);
  float span = dot(along, stage);
  float at = dot(along, pos);
  float across = free > 0.0 ? min(1.0, t / free) : 1.0;
  float wide = peak * (shape.x + (1.0 - shape.x) * pow(across, shape.y));
  float rim = mix(edge.x, edge.y, t);
  if (rim > 0.0) wide = max(wide, rim * (1.0 - smoothstep(0.0, rimmed.x * rim, min(at, span - at))));
  float gap = rimmed.y * wide;
  float soft = max(0.5 * px, 0.75 * gap);
  float lod = max(sharp, log2(max(1.0, gap * max(texels.x, texels.y))));
  vec3 sum = vec3(0.0);
  float had = 0.0;
  if (peak + edge.x + edge.y <= 0.0) {
    sum = textureLod(page, pos / stage, lod).rgb;
    had = 1.0;
  } else {
    for (int y = -2; y <= 2; y++) {
      for (int x = -2; x <= 2; x++) {
        vec2 tap = pos + vec2(float(x), float(y)) * gap;
        float share = seen(tap, soft) * WEIGHTS[abs(x)] * WEIGHTS[abs(y)];
        sum += textureLod(page, tap / stage, lod).rgb * share;
        had += share;
      }
    }
  }
  sum = sum / max(had, ${LEAST.toFixed(4)}) * seen(pos, 0.5 * px);
  color = shaded(sum, t);
}`;

/** The screen's picture drawn by WebGL2, on a canvas that lies over the part that turns. */
export interface ScreenGl {
  canvas: HTMLCanvasElement;
  /** Take up a new picture of the page and draw it again. Where it cannot, it lets go of itself and hands the picture to the layers. */
  paint(shot: HTMLCanvasElement): void;
  /** Draw it as `look` has it. */
  draw(look: ScreenLook): void;
  /** Let go of the canvas, its context and what it holds. */
  release(): void;
}

function compile(gl: WebGL2RenderingContext, kind: number, source: string): WebGLShader | null {
  const shader = gl.createShader(kind);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return shader;
}

/** The first line of what WebGL2 says of a shader or a program that failed, or `otherwise` where it says nothing. */
function firstLine(log: string | null, otherwise: string): string {
  return log?.trim().split("\n")[0]?.trim() || otherwise;
}

/** Why a picture did not go up, from what the upload threw. */
function uploadWhy(error: unknown): string {
  const name = error instanceof Error ? error.name : String(error);
  const tainted = "the browser holds the picture as another origin's, as one with a picture, video or canvas from another origin drawn in, or a drawing of the page this browser does not trust";
  return `the picture could not be uploaded: ${name}${name === "SecurityError" ? `, ${tainted}` : ""}`;
}

/**
 * The screen of `place` drawn by WebGL2, or null where it cannot be. Each
 * time it cannot, as it is made, as it takes up a picture, or once its
 * context is lost, `refused` is told why in a plain sentence, and the
 * picture it holds by then, for the layers to show instead.
 */
export function screenGl(
  place: ScreenPlace,
  refused: (why: string, shot: HTMLCanvasElement | null) => void,
): ScreenGl | null {
  const canvas = document.createElement("canvas");
  const gl = contextOf(canvas);
  if (!gl) {
    refused(typeof WebGL2RenderingContext === "undefined" ? "this browser has no WebGL2" : "the canvas gave no WebGL2 context", null);
    return null;
  }
  const rect = canvasRect(place);
  const most = Math.max(1, gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) || 4096);
  const density = Math.min(place.density, most / rect.width, most / rect.height);
  canvas.width = Math.max(1, Math.round(rect.width * density));
  canvas.height = Math.max(1, Math.round(rect.height * density));
  canvas.style.position = "absolute";
  canvas.style.display = "block";
  canvas.style.left = `${rect.x}px`;
  canvas.style.top = `${rect.y}px`;
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
  const program = gl.createProgram();
  const corners = gl.createBuffer();
  const texture = gl.createTexture();
  const free = () => {
    gl.deleteTexture(texture);
    gl.deleteBuffer(corners);
    gl.deleteProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    canvas.remove();
  };
  if (!vertex || !fragment || !program || !corners || !texture) {
    // A lost context makes nothing: Chrome loses the oldest once a page holds too many.
    const why = gl.isContextLost() ? "the WebGL2 context was lost as it was made" : "WebGL2 made no shader, program, buffer or texture";
    free();
    refused(why, null);
    return null;
  }
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = [vertex, fragment].map((shader) => gl.getShaderInfoLog(shader)).find((said) => said?.trim()) ?? gl.getProgramInfoLog(program);
    const lost = gl.isContextLost();
    free();
    refused(lost ? "the WebGL2 context was lost as it was made" : `the shader did not compile or link: ${firstLine(log, "no reason given")}`, null);
    return null;
  }
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, corners);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
  const corner = gl.getAttribLocation(program, "corner");
  gl.enableVertexAttribArray(corner);
  gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0);
  const at = (name: string) => gl.getUniformLocation(program, name);
  const { stage } = place;
  gl.uniform4f(at("view"), rect.x, rect.y, rect.width, rect.height);
  gl.uniform2f(at("stage"), stage.width, stage.height);
  gl.uniform2f(at("along"), place.across ? 0 : 1, place.across ? 1 : 0);
  gl.uniform3f(at("line"), ...hingeLine(place.pane, place.across, place.part));
  gl.uniform1f(at("px"), canvas.width > 0 ? rect.width / canvas.width : 1);
  gl.uniform1i(at("page"), 0);
  // Where a point of the half is across its screen's texture, and where the wipe and Apple's blurs run on it.
  const wipe = WIPE[place.pane];
  gl.uniform2f(at("run"), uvOf(place.pane, 0), uvOf(place.pane, 1) - uvOf(place.pane, 0));
  gl.uniform3f(at("wiped"), wipe.at, wipe.shade[0], wipe.shade[1]);
  gl.uniform2f(at("soften"), wipe.blur[0], wipe.blur[1]);
  const uniforms = { peak: at("peak"), edge: at("edge"), free: at("free"), dark: at("dark"), shape: at("shape"), rimmed: at("rimmed"), band: at("band"), lit: at("lit"), grain: at("grain") };
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.viewport(0, 0, canvas.width, canvas.height);
  const widest = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 2048;
  let shot: HTMLCanvasElement | null = null;
  let look: ScreenLook | null = null;
  let gone = false;
  const draw = (next: ScreenLook) => {
    look = next;
    if (gone || !shot) return;
    gl.uniform1f(uniforms.peak, next.peak);
    gl.uniform2f(uniforms.edge, ...next.edge);
    gl.uniform1f(uniforms.free, next.free);
    gl.uniform1f(uniforms.dark, next.dark);
    gl.uniform2f(uniforms.shape, tune.blurHinge, tune.blurRise);
    gl.uniform2f(uniforms.rimmed, tune.edgeReach, tune.blurSpread);
    gl.uniform3f(uniforms.band, tune.darkFrom, tune.darkBand, tune.darkBroad);
    gl.uniform3f(uniforms.lit, ...next.lit);
    gl.uniform1f(uniforms.grain, tune.grain);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };
  canvas.addEventListener("webglcontextlost", () => {
    if (gone) return;
    gone = true;
    canvas.remove();
    refused("the WebGL2 context was lost", shot);
  });
  /** Let go of it all, and hand `next` to the layers. */
  const refuse = (why: string, next: HTMLCanvasElement) => {
    if (!gone) free();
    gone = true;
    refused(why, next);
  };
  return {
    canvas,
    paint(next) {
      if (gone) return refuse("the WebGL2 context is gone", next);
      if (Math.max(next.width, next.height) > widest) {
        return refuse(`the picture, ${next.width} by ${next.height} px, is larger than MAX_TEXTURE_SIZE, ${widest}`, next);
      }
      // An error left from before is not this picture's.
      gl.getError();
      try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, next);
      } catch (error) {
        // A picture the page will not let out, drawn from another origin, stays with the layers.
        return refuse(uploadWhy(error), next);
      }
      // What does not throw is only told when asked: once a picture, not once a frame.
      const failed = gl.getError();
      if (failed !== gl.NO_ERROR) return refuse(`the picture could not be uploaded: WebGL2 error 0x${failed.toString(16)}`, next);
      gl.generateMipmap(gl.TEXTURE_2D);
      shot = next;
      if (look) draw(look);
    },
    draw,
    release() {
      if (gone) return;
      gone = true;
      free();
    },
  };
}
