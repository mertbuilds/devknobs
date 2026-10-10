import {
  blurShare,
  darkAt,
  type FoldShots,
  freeDepth,
  type Pane,
  type Quad,
  shotPane,
  shotPicture,
  shotQuad,
  shotWindow,
  turnBlur,
} from "./fold";
import { tune } from "./foldtune";
import type { Rect } from "./mock";

/**
 * The page on the screen of a fold's half that turns, drawn by WebGL2 from
 * a picture of it, as Apple and jadon7/iphone-duo draw theirs: blurred from
 * the hinge toward the free edge as the hinge sets it, and past the
 * picture's ends along the hinge, where the turned screen reaches past it,
 * blurred together with the black there, so its colour spreads into the
 * dark and the line between them never shows, and so at the turned screen's
 * free edge, where the page is cut off as it is seen. The blur is the picture's
 * mipmaps, sampled 25 times about each point as far apart as it is wide.
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
}

/**
 * How the turned screen is blurred with the hinge `open` of the way open,
 * reaching `wedge` css px past the picture's ends at its free edge, and its
 * free edge seen `free` of the way from the hinge to the picture's.
 */
export function screenLook(open: number, wedge: number, free = 1): ScreenLook {
  return { peak: turnBlur(open), edge: [tune.edgeHinge * wedge, tune.edgeFree * wedge], free, dark: freeDepth(open) };
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
 * flat there, so the page is blurred into the dark past that cut, as past
 * its ends.
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
 * `blurAt` and `coverage`, the same, then the picture and the
 * black past it blurred together: past its ends along the hinge, and past
 * where the turned screen's free edge cuts it, and darkened toward that edge
 * as `freeDark` has it. What `tune` has comes in as uniforms, so a number
 * changed by hand shows at the next draw.
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
uniform float px;
in vec2 pos;
out vec4 color;
const float WEIGHTS[3] = float[3](0.375, 0.25, 0.0625);
float cover(float at, float span, float soft) {
  return smoothstep(-soft, soft, at) * (1.0 - smoothstep(span - soft, span + soft, at));
}
float shadow(float t) {
  float across = t / max(free, 0.001);
  float deep = band.z * smoothstep(band.x, 1.0, across) + (1.0 - band.z) * smoothstep(1.0 - band.y, 1.0, across);
  return 1.0 - dark * deep;
}
float seen(vec2 at, float soft) {
  float reach = soft * length(line.xy);
  return cover(dot(along, at), dot(along, stage), soft) * (1.0 - smoothstep(free - reach, free + reach, dot(line.xy, at) + line.z));
}
void main() {
  float t = clamp(dot(line.xy, pos) + line.z, 0.0, 1.0);
  float span = dot(along, stage);
  float at = dot(along, pos);
  float across = free > 0.0 ? min(1.0, t / free) : 1.0;
  float wide = peak * (shape.x + (1.0 - shape.x) * pow(across, shape.y));
  float rim = mix(edge.x, edge.y, t);
  if (rim > 0.0) wide = max(wide, rim * (1.0 - smoothstep(0.0, rimmed.x * rim, min(at, span - at))));
  float gap = rimmed.y * wide;
  vec2 texels = vec2(textureSize(page, 0)) / stage;
  float soft = max(0.5 * px, 0.75 * gap);
  if (gap < 0.5 * px) {
    color = vec4(texture(page, pos / stage).rgb * seen(pos, soft) * shadow(t), 1.0);
    return;
  }
  float lod = log2(max(1.0, gap * max(texels.x, texels.y)));
  vec3 sum = vec3(0.0);
  for (int y = -2; y <= 2; y++) {
    for (int x = -2; x <= 2; x++) {
      vec2 tap = pos + vec2(float(x), float(y)) * gap;
      float weight = WEIGHTS[abs(x)] * WEIGHTS[abs(y)];
      sum += textureLod(page, tap / stage, lod).rgb * seen(tap, soft) * weight;
    }
  }
  color = vec4(sum * shadow(t), 1.0);
}`;

/** The screen's picture drawn by WebGL2, on a canvas that lies over the part that turns. */
export interface ScreenGl {
  canvas: HTMLCanvasElement;
  /** Take up a new picture of the page and draw it again. False where it cannot, so the layers must. */
  paint(shot: HTMLCanvasElement): boolean;
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

/**
 * The screen of `place` drawn by WebGL2, or null where it cannot be. Should
 * the context be lost, the canvas goes, and `lost` is told the picture it
 * last took up, for the layers to show instead.
 */
export function screenGl(place: ScreenPlace, lost: (shot: HTMLCanvasElement | null) => void): ScreenGl | null {
  const canvas = document.createElement("canvas");
  const gl = contextOf(canvas);
  if (!gl) return null;
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
    free();
    return null;
  }
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    free();
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
  const uniforms = { peak: at("peak"), edge: at("edge"), free: at("free"), dark: at("dark"), shape: at("shape"), rimmed: at("rimmed"), band: at("band") };
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.viewport(0, 0, canvas.width, canvas.height);
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
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };
  canvas.addEventListener("webglcontextlost", () => {
    if (gone) return;
    gone = true;
    canvas.remove();
    lost(shot);
  });
  return {
    canvas,
    paint(next) {
      if (gone) return false;
      try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, next);
      } catch {
        // A picture the page will not let out, drawn from another origin, stays with the layers.
        return false;
      }
      gl.generateMipmap(gl.TEXTURE_2D);
      shot = next;
      if (look) draw(look);
      return true;
    },
    draw,
    release() {
      if (gone) return;
      gone = true;
      free();
    },
  };
}
