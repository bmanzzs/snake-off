import * as THREE from './node_modules/three/build/three.module.js';

// ---------- constants ----------
export const GRID = 15;              // cells per side
export const HALF = (GRID - 1) / 2;  // cell coords run 0..GRID-1
export const cellX = (c) => c - HALF;

// ---------- renderer ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.getElementById('scene').appendChild(renderer.domElement);

// ---------- scene & camera ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d1322);
scene.fog = new THREE.Fog(0x0d1322, 30, 55);

const camera = new THREE.PerspectiveCamera(
  45, window.innerWidth / window.innerHeight, 0.1, 100
);
camera.position.set(0, 11.5, 12.5);
camera.lookAt(0, -0.2, 0);

// ---------- lights ----------
scene.add(new THREE.AmbientLight(0x8fa0cc, 0.55));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(7, 12, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -12; sun.shadow.camera.right = 12;
sun.shadow.camera.top = 12;   sun.shadow.camera.bottom = -12;
sun.shadow.camera.far = 40;
sun.shadow.bias = -0.0004;
scene.add(sun);
const rim = new THREE.PointLight(0x4a5fd0, 0.6, 30);
rim.position.set(-8, 4, -6);
scene.add(rim);

// ---------- board ----------
const board = new THREE.Group();
scene.add(board);

const panel = new THREE.Mesh(
  new THREE.BoxGeometry(GRID + 1.4, 0.5, GRID + 1.4),
  new THREE.MeshStandardMaterial({ color: 0x141c33, roughness: 0.9, metalness: 0.1 })
);
panel.position.y = -0.35;
panel.receiveShadow = true;
board.add(panel);

const grid = new THREE.GridHelper(GRID, GRID, 0x33406e, 0x222c4e);
grid.position.y = 0.001;
board.add(grid);

// glowing border frame
const frameMat = new THREE.MeshStandardMaterial({
  color: 0x2c3a6b, emissive: 0x3d55c4, emissiveIntensity: 0.55,
  roughness: 0.4, metalness: 0.3
});
const frameT = 0.28, frameH = 0.55, L = GRID + 1.4;
for (const [w, d, x, z] of [
  [L, frameT, 0,  HALF + frameT / 2], [L, frameT, 0, -HALF - frameT / 2],
  [frameT, L,  HALF + frameT / 2, 0], [frameT, L, -HALF - frameT / 2, 0]
]) {
  const bar = new THREE.Mesh(new THREE.BoxGeometry(w, frameH, d), frameMat);
  bar.position.set(x, 0.05, z);
  board.add(bar);
}

// ---------- snake (static for now) ----------
const snake = new THREE.Group();
scene.add(snake);

export function makeSnakeSegment(t) {
  // t: 0 at head, 1 at tail — lerp color + size
  const color = new THREE.Color().lerpColors(
    new THREE.Color(0x9dff57), new THREE.Color(0x1d8a46), t
  );
  const r = 0.40 * (1 - 0.35 * t);
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(r, 28, 22),
    new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.15 })
  );
  m.castShadow = true;
  return m;
}

// head with eyes
export function makeHead() {
  const head = new THREE.Group();
  const body = makeSnakeSegment(0);
  body.scale.set(1.12, 0.95, 1.12);
  head.add(body);
  const eyeGeo = new THREE.SphereGeometry(0.13, 16, 12);
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 });
  const pupilGeo = new THREE.SphereGeometry(0.07, 12, 10);
  const pupilMat = new THREE.MeshStandardMaterial({ color: 0x10131c, roughness: 0.3 });
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(0.18, 0.36, side * 0.15);
    const pupil = new THREE.Mesh(pupilGeo, pupilMat);
    pupil.position.set(0.21, 0.46, side * 0.17);
    head.add(eye, pupil);
  }
  const tongue = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.035, 0.05),
    new THREE.MeshStandardMaterial({ color: 0xff2a4d, roughness: 0.5 })
  );
  tongue.name = 'tongue';
  tongue.position.set(0.62, 0.24, 0);
  head.add(tongue);
  return head;
}

// ---------- game state ----------
const state = { mode: 'playing', score: 0, best: 0 };
let cells = [
  { x: 7, z: 7 },   // head (center)
  { x: 6, z: 7 },
  { x: 5, z: 7 },
];
let dir = { x: 1, z: 0 };
const inputQueue = [];
let apple = null;            // set in a later step

// display interpolation per segment
let segFrom = [], segTo = [];

function buildSnake() {
  snake.clear();
  segFrom = []; segTo = [];
  cells.forEach((c, i) => {
    const t = cells.length <= 1 ? 0 : i / (cells.length - 1);
    const seg = i === 0 ? makeHead() : makeSnakeSegment(t);
    seg.position.set(cellX(c.x), 0.05, cellX(c.z));
    snake.add(seg);
    segFrom.push(new THREE.Vector3(cellX(c.x), 0.05, cellX(c.z)));
    segTo.push(new THREE.Vector3(cellX(c.x), 0.05, cellX(c.z)));
  });
  const headLight = new THREE.PointLight(0x9dff57, 1.6, 3);
  headLight.position.set(0.3, 0.6, 0);
  snake.children[0].add(headLight);
}
buildSnake();

export function placeSnakeCells(newCells) {
  cells = newCells.map(c => ({ ...c }));
  buildSnake();
}

// ---------- input ----------
const KEYMAP = {
  ArrowUp:    { x: 0, z: -1 }, KeyW: { x: 0, z: -1 },
  ArrowDown:  { x: 0, z: 1 },  KeyS: { x: 0, z: 1 },
  ArrowLeft:  { x: -1, z: 0 }, KeyA: { x: -1, z: 0 },
  ArrowRight: { x: 1, z: 0 },  KeyD: { x: 1, z: 0 },
};
window.addEventListener('keydown', (e) => {
  if (state.mode === 'over') {
    if (e.code === 'Enter' || e.code === 'Space') {
      e.preventDefault();
      restart();
    }
    return;
  }
  if (state.mode !== 'playing') return;
  const d = KEYMAP[e.code];
  if (!d) return;
  e.preventDefault();
  const last = inputQueue.length ? inputQueue[inputQueue.length - 1] : dir;
  const same = d.x === last.x && d.z === last.z;
  const opp = d.x === -last.x && d.z === -last.z;
  if (same || opp) return;
  if (inputQueue.length < 2) inputQueue.push(d);
});

// ---------- game step ----------
const TICK = 140; // ms per cell

function headAngleFor(d) { return Math.atan2(-d.z, d.x); }

function step() {
  if (inputQueue.length) dir = inputQueue.shift();
  const head = cells[0];
  const nx = head.x + dir.x, nz = head.z + dir.z;

  // wall collision
  if (nx < 0 || nx >= GRID || nz < 0 || nz >= GRID) { setOver(); return; }

  // apple (step 3)
  const ate = apple && nx === apple.x && nz === apple.z;

  // self collision (tail tip vacates this tick unless we grow)
  const body = ate ? cells : cells.slice(0, -1);
  if (body.some(c => c.x === nx && c.z === nz)) { setOver(); return; }

  // advance logical cells
  cells.unshift({ x: nx, z: nz });
  const grew = !!ate;
  if (!grew) cells.pop();

  // update display targets: each segment slides to its new cell
  for (let i = 0; i < cells.length; i++) {
    if (segTo.length > i) segFrom[i].copy(segTo[i]);
    else segFrom.push(new THREE.Vector3(cellX(cells[cells.length - 1].x), 0.05, cellX(cells[cells.length - 1].z)));
    segTo[i] = segTo[i] || new THREE.Vector3();
    segTo[i].set(cellX(cells[i].x), 0.05, cellX(cells[i].z));
  }
  // add new tail mesh if grown
  if (grew && snake.children.length < cells.length) {
    const n = cells.length;
    const t = (n - 1) / (n - 1);
    const seg = makeSnakeSegment(1);
    const c = cells[n - 1];
    seg.position.set(cellX(c.x), 0.05, cellX(c.z));
    snake.add(seg);
    segFrom.push(segTo[segTo.length - 1].clone());
    segTo.push(new THREE.Vector3(cellX(c.x), 0.05, cellX(c.z)));
  }

  if (ate) onAte();
}

function onAte() {
  state.score += 1;
  const isRecord = state.score > state.best;
  if (isRecord) state.newBestRun = true;
  state.best = Math.max(state.best, state.score);
  const s = document.getElementById('score');
  const b = document.getElementById('best');
  if (s) {
    s.textContent = String(state.score);
    s.classList.remove('pop'); void s.offsetWidth; s.classList.add('pop');
  }
  if (b) b.textContent = String(state.best);
  shake = 1;
  burst();            // step 4 (no-op until then)
  placeAppleAt(spawnApple());
}
function setOver() {
  state.mode = 'over';
  inputQueue.length = 0;
  onOver();
}
const DEAD_RED = new THREE.Color(0xff4444);
function onOver() {
  const f = document.getElementById('final');
  if (f) f.textContent = String(state.score);
  const nb = document.getElementById('newbest');
  if (nb) nb.classList.toggle('show', !!state.newBestRun);
  const go = document.getElementById('gameover');
  if (go) go.classList.add('show');
  // death tint: snake fades to a dull red
  snake.children.forEach((child, i) => {
    const targets = i === 0 ? [child.children[0]] : [child];
    targets.forEach(m => {
      if (!m || !m.material || !m.material.color) return;
      m.material.color.lerp(DEAD_RED, 0.45).multiplyScalar(0.7);
    });
  });
}

// ---------- restart ----------
function restart() {
  state.mode = 'playing';
  state.score = 0;
  state.newBestRun = false;
  inputQueue.length = 0;
  dir = { x: 1, z: 0 };
  cells = [
    { x: 7, z: 7 },
    { x: 6, z: 7 },
    { x: 5, z: 7 },
  ];
  buildSnake();
  acc = 0;
  burstActive = false;
  burstPts.visible = false;
  placeAppleAt(spawnApple());
  const s = document.getElementById('score');
  if (s) s.textContent = '0';
  const nb = document.getElementById('newbest');
  if (nb) nb.classList.remove('show');
  const go = document.getElementById('gameover');
  if (go) go.classList.remove('show');
}
document.getElementById('restart').addEventListener('click', restart);

// ---------- apple ----------
const appleGroup = new THREE.Group();
const appleBody = new THREE.Mesh(
  new THREE.SphereGeometry(0.32, 24, 18),
  new THREE.MeshStandardMaterial({
    color: 0xe8352f, roughness: 0.25, metalness: 0.1,
    emissive: 0x5a0f0c, emissiveIntensity: 0.55,
  })
);
const stem = new THREE.Mesh(
  new THREE.CylinderGeometry(0.035, 0.05, 0.2, 8),
  new THREE.MeshStandardMaterial({ color: 0x5b3a1e, roughness: 0.9 })
);
stem.position.set(0, 0.36, 0);
const leaf = new THREE.Mesh(
  new THREE.ConeGeometry(0.09, 0.22, 8),
  new THREE.MeshStandardMaterial({ color: 0x3fae4c, roughness: 0.5, side: THREE.DoubleSide })
);
leaf.position.set(0.13, 0.4, 0);
leaf.rotation.z = -Math.PI / 3;
appleGroup.add(appleBody, stem, leaf);
appleBody.castShadow = true;
const appleLight = new THREE.PointLight(0xff5544, 3, 4.5);
appleLight.position.set(0, 0.4, 0);
appleGroup.add(appleLight);
appleGroup.visible = false;
scene.add(appleGroup);

function spawnApple() {
  const taken = new Set(cells.map(c => c.x + "," + c.z));
  const free = [];
  for (let x = 0; x < GRID; x++) for (let z = 0; z < GRID; z++) {
    if (!taken.has(x + "," + z)) free.push({ x, z });
  }
  if (!free.length) return null;
  return free[Math.floor(Math.random() * free.length)];
}

function placeAppleAt(cell) {
  if (!cell) { appleGroup.visible = false; apple = null; return; }
  apple = { ...cell };
  appleGroup.visible = true;
  const w = new THREE.Vector3(cellX(cell.x), 0.45, cellX(cell.z));
  appleGroup.position.copy(w);
  appleBaseY = w.y;
  // pop-in scale
  applePop = 0;
}
let appleBaseY = 0.45;
let applePop = 0;

// ---------- particle burst ----------
const BURST_N = 90;
const burstGeo = new THREE.BufferGeometry();
const burstPos = new Float32Array(BURST_N * 3);
const burstCol = new Float32Array(BURST_N * 3);
burstGeo.setAttribute('position', new THREE.BufferAttribute(burstPos, 3));
burstGeo.setAttribute('color', new THREE.BufferAttribute(burstCol, 3));
const burstMat = new THREE.PointsMaterial({
  size: 0.16, vertexColors: true, transparent: true, opacity: 1,
  blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
});
const burstPts = new THREE.Points(burstGeo, burstMat);
burstPts.visible = false;
burstPts.frustumCulled = false;
scene.add(burstPts);

let burstActive = false, burstLife = 0;
const burstVel = new Float32Array(BURST_N * 3);
const burstBase = new Float32Array(BURST_N * 3);
const PALETTE = [
  new THREE.Color(0xff5544), new THREE.Color(0xffb347),
  new THREE.Color(0xfff2cc), new THREE.Color(0xff3366),
];

function burst() {
  const o = appleGroup.position;
  for (let i = 0; i < BURST_N; i++) {
    burstPos[i * 3]     = o.x + (Math.random() - 0.5) * 0.3;
    burstPos[i * 3 + 1] = o.y + (Math.random() - 0.5) * 0.3;
    burstPos[i * 3 + 2] = o.z + (Math.random() - 0.5) * 0.3;
    const a = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
    const sp = 1.6 + Math.random() * 3.2;
    burstVel[i * 3]     = Math.sin(ph) * Math.cos(a) * sp;
    burstVel[i * 3 + 1] = Math.cos(ph) * sp * 0.8 + 1.6;
    burstVel[i * 3 + 2] = Math.sin(ph) * Math.sin(a) * sp;
    const c = PALETTE[i % PALETTE.length];
    burstBase[i * 3] = c.r; burstBase[i * 3 + 1] = c.g; burstBase[i * 3 + 2] = c.b;
  }
  burstActive = true;
  burstLife = 0;
  burstPts.visible = true;
  burstGeo.attributes.position.needsUpdate = true;
}

placeAppleAt(spawnApple());

// ---------- resize & loop ----------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

let lastT = performance.now();
let acc = 0;
let tGlobal = 0;
let shake = 0;
const camHomeZ = 12.5;
const tmpV = new THREE.Vector3();

function angleLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = Math.min((now - lastT) / 1000, 0.1);
  lastT = now;
  tGlobal += dt;

  if (state.mode === 'playing') {
    acc += dt * 1000;
    while (acc >= TICK) { acc -= TICK; step(); }
  }

  const t = state.mode === 'playing' ? Math.min(acc / TICK, 1) : 1;
  const e = t * t * (3 - 2 * t); // smoothstep
  for (let i = 0; i < snake.children.length; i++) {
    if (!segFrom[i] || !segTo[i]) continue;
    tmpV.lerpVectors(segFrom[i], segTo[i], e);
    snake.children[i].position.copy(tmpV);
  }
  // head faces travel direction
  const head = snake.children[0];
  if (head) {
    const target = headAngleFor(dir);
    head.rotation.y = angleLerp(head.rotation.y, target, 1 - Math.pow(0.002, dt));
  }

  // apple: bob, spin, pop-in
  if (appleGroup.visible) {
    applePop = Math.min(applePop + dt * 4, 1);
    const popScale = 0.3 + 0.7 * (1 - Math.pow(1 - applePop, 3));
    appleGroup.scale.setScalar(popScale);
    appleGroup.position.y = appleBaseY + Math.sin(tGlobal * 2.4) * 0.07;
    appleGroup.rotation.y += dt * 1.6;
  }

  // particle burst update
  if (burstActive) {
    burstLife += dt / 0.75;
    const fade = Math.max(1 - burstLife, 0);
    for (let i = 0; i < BURST_N; i++) {
      burstVel[i * 3 + 1] -= 6.5 * dt;
      burstPos[i * 3]     += burstVel[i * 3] * dt;
      burstPos[i * 3 + 1] += burstVel[i * 3 + 1] * dt;
      burstPos[i * 3 + 2] += burstVel[i * 3 + 2] * dt;
      burstCol[i * 3]     = burstBase[i * 3] * fade;
      burstCol[i * 3 + 1] = burstBase[i * 3 + 1] * fade;
      burstCol[i * 3 + 2] = burstBase[i * 3 + 2] * fade;
    }
    burstGeo.attributes.position.needsUpdate = true;
    burstGeo.attributes.color.needsUpdate = true;
    if (burstLife >= 1) { burstActive = false; burstPts.visible = false; }
  }

  // tongue flick
  const headGroup = snake.children[0];
  if (headGroup) {
    const tongue = headGroup.children.find(ch => ch.name === 'tongue');
    if (tongue) {
      const cyc = tGlobal % 2.6;
      const out = cyc < 0.6 ? Math.sin((cyc / 0.6) * Math.PI) : 0;
      tongue.position.x = 0.62 + out * 0.45;
    }
  }

  // camera micro-shake (decays after eating)
  shake *= Math.exp(-dt * 6);
  if (shake < 0.003) shake = 0;
  camera.position.x = (Math.random() - 0.5) * shake * 0.3;
  camera.position.z = camHomeZ + (Math.random() - 0.5) * shake * 0.3;
  camera.lookAt(0, -0.2, 0);

  renderer.render(scene, camera);
}
animate();

// ---------- debug/test hook ----------
window.__snake = {
  state: () => ({ ...state }),
  cells: () => cells.map(c => ({ ...c })),
  dir: () => ({ ...dir }),
  apple: () => (apple ? { ...apple } : null),
  setOver,
  onAte,
};
