// Renders the iPhone Duo's case at each angle of its fold, offline, for the
// frames in assets/bezels/duo-fold. The scene, its lights, the mesh ids, the
// screen geometry and the fold's bend are adapted from jadon7/iphone-duo (MIT,
// see THIRD_PARTY_NOTICES.md), on Apple's Star White model, which that repo's
// scripts/prepare-assets.py downloads. The screens are punched out to
// transparent and the camera is devknobs' own, on the hinge's axis. Never part
// of the package: see README.md here.
import * as THREE from 'three';
import { USDLoader } from 'three/addons/loaders/USDLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// devknobs: the open inner screen is 951 css px across, drawn at 3 image px per css px,
// seen from DEPTH = 2.75 screen widths in front of the screen plane.
const SCREEN_W = 15.7987, SCREEN_Z = 0.24948, HINGE_Z = 0.275454;
const CSS_W = 951, DPR = 3, DEPTH = 2.75;
const K = DPR * CSS_W / SCREEN_W; // image px per model unit at the screen plane
const D = DEPTH * SCREEN_W;
const params = new URLSearchParams(location.search);
const W = Number(params.get('w') || 3120), H = Number(params.get('h') || 2760);

const canvas = document.createElement('canvas');
document.body.appendChild(canvas);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true, premultipliedAlpha: false });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.setClearColor(0x000000, 0);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;

const scene = new THREE.Scene();
const environment = new RoomEnvironment();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(environment, .04).texture;
scene.environmentIntensity = 1.35;
scene.add(new THREE.HemisphereLight(0xffffff, 0xb5baa8, 1.8));
const key = new THREE.DirectionalLight(0xfffcf5, 2.6);
key.position.set(-15, 25, 30);
scene.add(key);
const rim = new THREE.DirectionalLight(0xe8edf5, 2);
rim.position.set(15, 5, -15);
scene.add(rim);

// Perspective camera on the hinge's axis, D in front of the screen plane, sized so the
// screen plane is K px per unit.
const camera = new THREE.PerspectiveCamera(THREE.MathUtils.radToDeg(2 * Math.atan(H / K / 2 / D)), W / H, .1, 250);
camera.position.set(0, 0, SCREEN_Z + D);
camera.lookAt(0, 0, SCREEN_Z);
camera.updateProjectionMatrix();

const bend = { value: 0 };
// 1 keeps the moving half (cover side), 0 the fixed half, 2 both.
const side = { value: 2 };

const foldShader = `
uniform float foldAngle;
uniform float keepSide;
varying float vSourceX;
vec2 rotateHinge(vec2 p) {
  float c = cos(foldAngle), s = sin(foldAngle);
  p.y -= ${HINGE_Z};
  return vec2(c * p.x + s * p.y, -s * p.x + c * p.y + ${HINGE_Z});
}
#ifdef FLEXIBLE_SCREEN
vec4 bendStrip(vec3 p) {
  float halfWidth = 0.35;
  if (p.x >= halfWidth) return vec4(p.x, p.z, 1.0, 0.0);
  if (p.x <= -halfWidth) return vec4(rotateHinge(p.xz), cos(foldAngle), -sin(foldAngle));
  float t = (p.x + halfWidth) / (2.0 * halfWidth);
  float t2 = t*t, t3 = t2*t;
  vec2 a = rotateHinge(vec2(-halfWidth, p.z));
  vec2 b = vec2(halfWidth, p.z);
  vec2 ta = 2.0 * halfWidth * vec2(cos(foldAngle), -sin(foldAngle));
  vec2 tb = vec2(2.0 * halfWidth, 0.0);
  vec2 point = (2.0*t3-3.0*t2+1.0)*a + (t3-2.0*t2+t)*ta + (-2.0*t3+3.0*t2)*b + (t3-t2)*tb;
  vec2 tangent = normalize((6.0*t2-6.0*t)*a + (3.0*t2-4.0*t+1.0)*ta + (-6.0*t2+6.0*t)*b + (3.0*t2-2.0*t)*tb);
  return vec4(point, tangent);
}
#endif
`;

const holeMaterial = new THREE.ShaderMaterial({
  uniforms: { foldAngle: bend, keepSide: side },
  blending: THREE.NoBlending,
  vertexShader: `${foldShader}
    void main() {
      vSourceX = position.x;
      #ifdef FLEXIBLE_SCREEN
      vec4 f = bendStrip(position);
      #else
      vec2 f = rotateHinge(position.xz);
      #endif
      gl_Position = projectionMatrix * modelViewMatrix * vec4(f.x, position.y, f.y, 1.0);
    }`,
  fragmentShader: `uniform float keepSide; varying float vSourceX;
    void main() {
      if (keepSide == 1.0 && vSourceX > 0.35) discard;
      if (keepSide == 0.0 && vSourceX < 0.0) discard;
      gl_FragColor = vec4(0.0);
    }`,
});

const groups = { moving: [], fixed: [], flexible: [] };
const screenMeshes = {};
const info = [];

const model = await new USDLoader().loadAsync('./iphone-duo/assets/iPhone_Duo_Render.usdc');
model.scale.multiplyScalar(100);
model.updateMatrixWorld(true);
model.traverse(object => {
  if (!object.isMesh) return;
  const geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
  geometry.translate(0, -5.8974, 0);
  let ancestor = object;
  while (ancestor && !['upTUAKvMVkPOMKq', 'SiftyleUEEZwLhF'].includes(ancestor.name)) ancestor = ancestor.parent;
  const moving = ancestor?.name === 'upTUAKvMVkPOMKq';
  const flexible = ['JnJdTkxbQgUtLwU', 'xdyyaajWsatVNxN', 'UXtsBZYlaUvHoEh', 'MvKPXGSdYDVvSpk'].includes(object.name);
  const kind = object.name === 'UXtsBZYlaUvHoEh' ? 'inner' : object.name === 'hhgAIoCGsHXeDPY' ? 'outer' : null;
  let material;
  if (kind) {
    material = holeMaterial.clone();
    material.uniforms = { foldAngle: bend, keepSide: side };
    if (flexible) material.defines = { FLEXIBLE_SCREEN: '' };
    if (!moving && !flexible) material.uniforms.keepSide = { value: -1 };
  } else {
    material = object.material.clone();
    material.onBeforeCompile = shader => {
      shader.uniforms.foldAngle = bend;
      shader.uniforms.keepSide = side;
      if (moving || flexible) {
        shader.vertexShader = `${flexible ? '#define FLEXIBLE_SCREEN\n' : ''}${foldShader}\n${shader.vertexShader}`;
        shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', flexible ? `
          vec4 folded = bendStrip(position);
          vec3 transformed = vec3(folded.x, position.y, folded.y);
          vSourceX = position.x;
        ` : `
          vec2 folded = rotateHinge(position.xz);
          vec3 transformed = vec3(folded.x, position.y, folded.y);
          vSourceX = -1.0e3;
        `);
        shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', `
          vec3 objectNormal = vec3(normal);
          ${flexible ? 'vec4 strip = bendStrip(position); float a = atan(-strip.w, strip.z);' : 'float a = foldAngle;'}
          objectNormal.x = cos(a) * normal.x + sin(a) * normal.z;
          objectNormal.z = -sin(a) * normal.x + cos(a) * normal.z;
        `);
      } else {
        shader.vertexShader = `uniform float keepSide; varying float vSourceX;\n${shader.vertexShader}`;
        shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\nvSourceX = 1.0e3;`);
      }
      shader.fragmentShader = `uniform float keepSide; varying float vSourceX;\n${shader.fragmentShader}`;
      shader.fragmentShader = shader.fragmentShader.replace('void main() {', `void main() {
        if (keepSide == 1.0 && vSourceX > 0.35) discard;
        if (keepSide == 0.0 && vSourceX < 0.35) discard;`);
    };
    material.customProgramCacheKey = () => `${object.name}-${flexible ? 'flex' : moving ? 'move' : 'fix'}`;
  }
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = object.name;
  mesh.frustumCulled = false;
  mesh.userData = { moving, flexible, kind };
  geometry.computeBoundingBox();
  const b = geometry.boundingBox;
  info.push({ name: object.name, moving, flexible, kind, mat: object.material.name, type: object.material.type,
    transparent: object.material.transparent, opacity: object.material.opacity,
    min: b.min.toArray().map(v => +v.toFixed(3)), max: b.max.toArray().map(v => +v.toFixed(3)) });
  if (kind) screenMeshes[kind] = mesh;
  scene.add(mesh);
});

// Fold a model point (open pose) as the vertex shader does: rigid on the moving half,
// the Hermite strip within 0.35 of the hinge.
function rotateHinge(x, z, a) {
  const c = Math.cos(a), s = Math.sin(a);
  z -= HINGE_Z;
  return [c * x + s * z, -s * x + c * z + HINGE_Z];
}
function foldPoint(x, y, z, a) {
  const h = 0.35;
  if (x >= h) return [x, y, z];
  if (x <= -h) { const [fx, fz] = rotateHinge(x, z, a); return [fx, y, fz]; }
  const t = (x + h) / (2 * h), t2 = t * t, t3 = t2 * t;
  const A = rotateHinge(-h, z, a), B = [h, z];
  const TA = [2 * h * Math.cos(a), -2 * h * Math.sin(a)], TB = [2 * h, 0];
  const f = (i) => (2*t3-3*t2+1)*A[i] + (t3-2*t2+t)*TA[i] + (-2*t3+3*t2)*B[i] + (t3-t2)*TB[i];
  return [f(0), y, f(1)];
}
function project([x, y, z]) {
  const v = new THREE.Vector3(x, y, z).project(camera);
  return [+((v.x + 1) / 2 * W).toFixed(2), +((1 - v.y) / 2 * H).toFixed(2)];
}
const INNER = { x0: -7.89935, x1: 7.89935, y0: .34562 - 5.8974, y1: .34562 - 5.8974 + 11.1035, z: SCREEN_Z };
const COVER = { x0: -.23396 - 7.73936, x1: -.23396, y0: .27173 - 5.8974, y1: .27173 - 5.8974 + 11.2513, z: -.27463 };
// Corners top left, top right, bottom right, bottom left, as seen in the open pose from the front.
function corners(a) {
  const q = (x0, x1, y0, y1, z) => [[x0, y1, z], [x1, y1, z], [x1, y0, z], [x0, y0, z]].map(p => project(foldPoint(...p, a)));
  return {
    innerMoving: q(INNER.x0, 0, INNER.y0, INNER.y1, INNER.z),
    innerFixed: q(0, INNER.x1, INNER.y0, INNER.y1, INNER.z),
    // The cover's corners in its own front view (hinge on its left once shut): mirrored x.
    cover: [[COVER.x1, COVER.y1], [COVER.x0, COVER.y1], [COVER.x0, COVER.y0], [COVER.x1, COVER.y0]]
      .map(([x, y]) => project(foldPoint(x, y, COVER.z, a))),
    hinge: [project(foldPoint(0, INNER.y1, INNER.z, a)), project(foldPoint(0, INNER.y0, INNER.z, a))],
  };
}

function render(a, pass) {
  bend.value = a;
  side.value = pass === 'moving' ? 1 : pass === 'fixed' ? 0 : 2;
  // Still half: the screen hole reaches the hinge line, over the hinge parts in front of it.
  for (const mesh of Object.values(screenMeshes)) {
    mesh.material.depthTest = pass !== 'fixed';
    mesh.renderOrder = pass === 'fixed' ? 1 : 0;
  }
  renderer.render(scene, camera);
}

/** Send a file to serve.ts, which writes it into the master folder. */
async function save(name, body) {
  const response = await fetch(`/save/${name}`, { method: 'POST', body });
  if (!response.ok) throw new Error(`could not save ${name}`);
}

window.api = {
  W, H, K, D, info,
  frame(a, pass = 'moving') {
    render(a, pass);
    return { png: canvas.toDataURL('image/png'), corners: corners(a) };
  },
  show(a, pass = 'full') { render(a, pass); return corners(a); },
  /**
   * Render the turning half every `step` degrees from open to shut, the half
   * that stays once, and every angle's corners, and save them all.
   */
  async renderAll(step = 3) {
    const angles = {};
    for (let deg = 0; deg <= 180; deg += step) {
      const { png, corners: seen } = this.frame((deg * Math.PI) / 180, 'moving');
      await save(`moving-${String(deg).padStart(3, '0')}.png`, await (await fetch(png)).blob());
      angles[deg] = seen;
    }
    const { png } = this.frame(0, 'fixed');
    await save('fixed.png', await (await fetch(png)).blob());
    await save('corners.json', JSON.stringify({ W, H, K, D, angles }));
    return Object.keys(angles).length;
  },
};
window.ready = true;
if (params.has('run')) {
  const count = await window.api.renderAll(Number(params.get('step') || 3));
  document.title = `rendered ${count} angles`;
}
