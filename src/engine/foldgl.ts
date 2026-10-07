import {
  BLURS,
  blurWidth,
  darkAt,
  type FoldShots,
  type Pane,
  type Quad,
  rawArea,
  shotPane,
  shotPicture,
  shotQuad,
  shotWindow,
  uvOf,
  wipeAmount,
} from "./fold";
import type { Rect } from "./mock";

/**
 * The page on the screen of a fold's half that turns, drawn by WebGL2 from
 * a picture of it, as Apple and jadon7/iphone-duo draw theirs: blurred from
 * the hinge toward the free edge as the hinge sets it, and past the
 * picture's ends along the hinge, where the turned screen reaches past it,
 * blurred together with the black there, so its colour spreads into the
 * dark and the line between them never shows. The blur is the picture's
 * mipmaps, sampled 25 times about each point as far apart as it is wide.
 * The picture goes up once as the fold starts, and each frame sets only a
 * few numbers and draws one quad. Where WebGL2 is not, the page's blurrier
 * pictures are laid over each other instead.
 */

/** How far apart the taps are, as a share of the blur's width: a spread about as soft as Apple's two passes. */
export const SPREAD = 0.5;

/** How far into the picture from an end the blur past it reaches, in widths of that blur. */
export const REACH = 1.5;

/**
 * How wide the blur at the picture's ends is, in widths of the dark past
 * them at the turned screen's free edge: at the hinge, and at the free edge.
 */
export const EDGE = [0.3, 1] as const;

/** How wide the blur grows, at most, in css px: as wide as the widest blurred picture. */
const MOST = BLURS[BLURS.length - 1];

/** How the screen is blurred with the hinge where it is, in the picture's css px. */
export interface ScreenLook {
  /** Apple's `blurArea` from the hinge to the free edge, before it is held to its range: where it starts, and how much it grows. */
  area: [start: number, slope: number];
  /** How wide a blur of `blurArea` 0 is, and the most. */
  base: number;
  most: number;
  /** How wide the blur at the picture's ends is, at the hinge and at the free edge. */
  edge: [hinge: number, free: number];
}

/**
 * How the screen of `pane` is blurred with the hinge `open` of the way open,
 * the screen `extent` css px across the hinge, the turned screen reaching
 * `wedge` css px past the picture's ends at its free edge.
 */
export function screenLook(pane: Pane, open: number, extent: number, wedge: number): ScreenLook {
  const amount = wipeAmount(pane, open);
  const start = rawArea(pane, uvOf(pane, 0), amount);
  return {
    area: [start, rawArea(pane, uvOf(pane, 1), amount) - start],
    base: blurWidth(pane, 0) * extent,
    most: MOST,
    edge: [EDGE[0] * wedge, EDGE[1] * wedge],
  };
}

/**
 * How wide the blur is, in css px, `t` of the way from the hinge to the free
 * edge, `inside` css px in from the picture's nearer end along the hinge,
 * less than 0 past it: Apple's, or the ends' where that is wider.
 */
export function blurAt(look: ScreenLook, t: number, inside: number): number {
  const area = Math.min(4 / 3, Math.max(0, look.area[0] + look.area[1] * t));
  const wipe = area > 0 ? Math.min(look.most, look.base * 2 ** (8 * area)) : 0;
  const rim = look.edge[0] + (look.edge[1] - look.edge[0]) * t;
  if (rim <= 0) return wipe;
  return Math.max(wipe, rim * (1 - smoothstep(0, REACH * rim, inside)));
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

/** `blurAt` and `coverage`, the same, then the picture and the black past it blurred together. */
const FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D page;
uniform vec2 stage;
uniform vec2 along;
uniform vec3 line;
uniform vec2 area;
uniform float base;
uniform float most;
uniform vec2 edge;
uniform float px;
in vec2 pos;
out vec4 color;
const float WEIGHTS[3] = float[3](0.375, 0.25, 0.0625);
float cover(float at, float span, float soft) {
  return smoothstep(-soft, soft, at) * (1.0 - smoothstep(span - soft, span + soft, at));
}
void main() {
  float t = clamp(dot(line.xy, pos) + line.z, 0.0, 1.0);
  float span = dot(along, stage);
  float at = dot(along, pos);
  float blur = clamp(area.x + area.y * t, 0.0, 4.0 / 3.0);
  float wide = blur > 0.0 ? min(most, base * exp2(8.0 * blur)) : 0.0;
  float rim = mix(edge.x, edge.y, t);
  if (rim > 0.0) wide = max(wide, rim * (1.0 - smoothstep(0.0, ${REACH.toFixed(3)} * rim, min(at, span - at))));
  float gap = ${SPREAD.toFixed(3)} * wide;
  vec2 texels = vec2(textureSize(page, 0)) / stage;
  float soft = max(0.5 * px, 0.75 * gap);
  if (gap < 0.5 * px) {
    color = vec4(texture(page, pos / stage).rgb * cover(at, span, soft), 1.0);
    return;
  }
  float lod = log2(max(1.0, gap * max(texels.x, texels.y)));
  vec3 sum = vec3(0.0);
  for (int y = -2; y <= 2; y++) {
    for (int x = -2; x <= 2; x++) {
      vec2 tap = pos + vec2(float(x), float(y)) * gap;
      float weight = WEIGHTS[abs(x)] * WEIGHTS[abs(y)];
      sum += textureLod(page, tap / stage, lod).rgb * cover(dot(along, tap), span, soft) * weight;
    }
  }
  color = vec4(sum, 1.0);
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
  const uniforms = { area: at("area"), base: at("base"), most: at("most"), edge: at("edge") };
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
    gl.uniform2f(uniforms.area, ...next.area);
    gl.uniform1f(uniforms.base, next.base);
    gl.uniform1f(uniforms.most, next.most);
    gl.uniform2f(uniforms.edge, ...next.edge);
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
