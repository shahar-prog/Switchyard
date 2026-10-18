(() => {
'use strict';

// ---------- helpers ----------
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // N E S W
const opp = d => (d + 2) % 4;
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Ordered so the earliest levels use the most distinct colors.
const PALETTE = [
  { id: 'red',    name: 'Red',    fill: '#e5483f', dark: '#9e231c' },
  { id: 'blue',   name: 'Blue',   fill: '#2f7fe0', dark: '#174a8f' },
  { id: 'yellow', name: 'Yellow', fill: '#f7c62f', dark: '#a37c08' },
  { id: 'purple', name: 'Purple', fill: '#8e55d9', dark: '#55298f' },
  { id: 'white',  name: 'White',  fill: '#f6f4ec', dark: '#8f8c80' },
  { id: 'orange', name: 'Orange', fill: '#f38b22', dark: '#a35206' },
  { id: 'black',  name: 'Black',  fill: '#34353d', dark: '#0e0e12' },
  { id: 'pink',   name: 'Pink',   fill: '#ff7ab9', dark: '#b83f78' },
  { id: 'cyan',   name: 'Cyan',   fill: '#33c8da', dark: '#147886' },
  { id: 'brown',  name: 'Brown',  fill: '#9a6338', dark: '#573417' },
];

const C = {
  grass: '#7db457', grassDark: '#6aa246', grassLight: '#93c76a',
  ballast: '#bcae92', tie: '#6e4b2f', rail: '#4f565f', railHi: '#dfe3e8',
  leaf: '#3f8139', leafDark: '#2d6a2c', trunk: '#6b4a2f', rock: '#a3a6a0',
  ok: '#2bb24c', bad: '#e0392f',
};

const TRAIN_OFFSETS = [0.27, 0.86, 1.42]; // engine centre, car 1, car 2 (cells behind the nose)
const TRAIN_LEN = 1.72;
const MIN_LEAD = 4;    // track cells between the tunnel and the first switch
const KEY_SPEEDS = { f: 3, ' ': 3, d: 2 }; // hold-to-speed-up keys

// ---------- saved progress ----------
const STORE_KEY = 'switchyard.v1';
function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (s && typeof s === 'object') return s;
  } catch (e) { /* storage unavailable */ }
  return {};
}
const save = Object.assign({ level: 1, maxLevel: 1, best: 0, muted: false }, loadSave());
function persist() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(save)); } catch (e) { /* storage unavailable */ }
}

// ---------- level progression ----------
function levelConfig(level) {
  const houses = Math.min(PALETTE.length, 2 + Math.ceil(level / 2));
  const speed = Math.min(2.7, 1.15 + level * 0.07);          // cells per second
  const trains = Math.min(30, 12 + houses * 2);
  const gap = Math.max(2.6 / speed + 0.4, 4.6 - level * 0.18); // seconds between departures
  let cols, rows;
  if (houses <= 3) [cols, rows] = [8, 6];
  else if (houses <= 5) [cols, rows] = [10, 7];
  else if (houses <= 7) [cols, rows] = [11, 8];
  else [cols, rows] = [13, 9];
  return { houses, speed, trains, gap, cols, rows };
}

// ---------- map generation ----------
// The track is a tree grown on a grid: a trunk leaves the tunnel, and each
// extra station is a branch that splits off an existing straight/curve cell,
// turning that cell into a two-way switch.
function tryGenerate(cols, rows, nHouses) {
  const grid = new Array(cols * rows).fill(null);
  const cells = [];
  const inside = (c, r) => c >= 0 && r >= 0 && c < cols && r < rows;
  const free = (c, r) => inside(c, r) && !grid[r * cols + c];
  const place = (c, r, type, entry, parent) => {
    const cell = { c, r, type, entry, parent, kids: [], active: 0, depth: parent ? parent.depth + 1 : 0, pop: 0, flash: 0 };
    grid[r * cols + c] = cell;
    cells.push(cell);
    if (parent) parent.kids.push(opp(entry));
    return cell;
  };
  const walk = (from, dir, minLen, maxLen) => {
    const target = randInt(minLen, maxLen);
    const steps = [];
    const used = new Set();
    let c = from.c, r = from.r, d = dir;
    while (steps.length < target) {
      const nc = c + DIRS[d][0], nr = r + DIRS[d][1];
      if (!free(nc, nr) || used.has(nr * cols + nc)) break;
      steps.push(d);
      used.add(nr * cols + nc);
      c = nc; r = nr;
      const opts = [];
      for (const nd of [d, d, (d + 1) % 4, (d + 3) % 4]) {
        const tc = c + DIRS[nd][0], tr = r + DIRS[nd][1];
        if (free(tc, tr) && !used.has(tr * cols + tc)) opts.push(nd);
      }
      if (!opts.length) break;
      d = pick(opts);
    }
    if (steps.length < minLen) return false;
    let prev = from;
    c = from.c; r = from.r;
    steps.forEach((sd, i) => {
      c += DIRS[sd][0]; r += DIRS[sd][1];
      prev = place(c, r, i === steps.length - 1 ? 'house' : 'track', opp(sd), prev);
    });
    return true;
  };

  const side = randInt(0, 3);
  let tc, tr;
  if (side === 0) { tr = 0; tc = randInt(1, cols - 2); }
  else if (side === 2) { tr = rows - 1; tc = randInt(1, cols - 2); }
  else if (side === 1) { tc = cols - 1; tr = randInt(1, rows - 2); }
  else { tc = 0; tr = randInt(1, rows - 2); }
  const tunnel = place(tc, tr, 'tunnel', side, null);
  if (!walk(tunnel, opp(side), MIN_LEAD + 2, MIN_LEAD + 5)) return null;

  let houses = 1;
  for (let tries = 0; houses < nHouses && tries < 400; tries++) {
    const x = pick(cells);
    // Keep switches apart: never directly after another switch or the tunnel.
    if (x.type !== 'track' || x.parent.type !== 'track') continue;
    // Give the player time to react before the first switch.
    if (x.depth < MIN_LEAD) continue;
    const kid = grid[(x.r + DIRS[x.kids[0]][1]) * cols + x.c + DIRS[x.kids[0]][0]];
    if (kid.type === 'switch') continue;
    const dirs = [0, 1, 2, 3].filter(d => d !== x.entry && d !== x.kids[0] && free(x.c + DIRS[d][0], x.r + DIRS[d][1]));
    if (!dirs.length) continue;
    if (walk(x, pick(dirs), 2, 6)) {
      x.type = 'switch';
      x.active = randInt(0, 1);
      houses++;
    }
  }
  if (houses < nHouses) return null;

  const houseCells = cells.filter(x => x.type === 'house');
  const minDepth = Math.min(...houseCells.map(h => h.depth));
  const spread = new Set(houseCells.map(h => h.c)).size + new Set(houseCells.map(h => h.r)).size;
  const score = cells.length + minDepth * 1.5 + spread + Math.random() * 4;
  return { cols, rows, grid, cells, tunnel, score };
}

function generateMap(cols, rows, nHouses) {
  for (let grow = 0; grow < 5; grow++) {
    let best = null;
    for (let i = 0; i < 300; i++) {
      const m = tryGenerate(cols, rows, nHouses);
      if (m && (!best || m.score > best.score)) best = m;
      if (best && i >= 50) break;
    }
    if (best) return finishMap(best, nHouses);
    cols++; rows++;
  }
  throw new Error('Could not build a track layout');
}

function finishMap(m, n) {
  m.houses = m.cells.filter(x => x.type === 'house');
  m.switches = m.cells.filter(x => x.type === 'switch');
  m.colors = PALETTE.slice(0, n);
  shuffle(m.colors.slice()).forEach((col, i) => { m.houses[i].color = col; });
  m.neighbor = (cell, d) => m.grid[(cell.r + DIRS[d][1]) * m.cols + cell.c + DIRS[d][0]];
  // Which station colors are reachable below each cell (used by the demo autopilot).
  const collect = cell => {
    cell.sub = new Set();
    if (cell.type === 'house') cell.sub.add(cell.color.id);
    for (const k of cell.kids) for (const id of collect(m.neighbor(cell, k))) cell.sub.add(id);
    return cell.sub;
  };
  collect(m.tunnel);

  m.decor = [];
  for (let r = -2; r < m.rows + 2; r++) {
    for (let c = -3; c < m.cols + 3; c++) {
      const inGrid = c >= 0 && r >= 0 && c < m.cols && r < m.rows;
      if (inGrid && m.grid[r * m.cols + c]) continue;
      if (Math.random() > (inGrid ? 0.38 : 0.5)) continue;
      m.decor.push({
        c, r,
        kind: pick(['tree', 'tree', 'tree', 'bush', 'bush', 'flowers', 'rock']),
        ox: rand(-0.18, 0.18), oy: rand(-0.18, 0.18), s: rand(0.8, 1.15),
        hue: Math.random(),
      });
    }
  }
  m.patches = [];
  for (let i = 0; i < 26; i++) {
    m.patches.push({ x: rand(-3, m.cols + 3), y: rand(-2, m.rows + 2), rx: rand(0.8, 2.4), ry: rand(0.5, 1.4), light: Math.random() < 0.5 });
  }
  return m;
}

// ---------- DOM ----------
const ICON_PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="4" width="4.5" height="16" rx="1.2"/><rect x="13.5" y="4" width="4.5" height="16" rx="1.2"/></svg>';
const ICON_SOUND = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 8.5a5 5 0 0 1 0 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const ICON_MUTED = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 9.5l5 5M21.5 9.5l-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

const app = document.getElementById('app');
app.innerHTML = `
<canvas id="board" aria-label="Rail yard. Tap a switch to change which way it sends trains."></canvas>
<header class="hud" id="hud" hidden>
  <div class="chip"><span class="lbl">Level</span><b id="hudLevel">1</b></div>
  <div class="chip"><span class="lbl">Score</span><b id="hudScore">0</b></div>
  <div class="spacer"></div>
  <div class="chip good"><span class="lbl">Correct</span><b id="hudCorrect">0</b></div>
  <div class="chip"><span class="lbl">Trains</span><b id="hudTrains">0/0</b></div>
  <button class="icon-btn" id="btnPause" type="button" aria-label="Pause">${ICON_PAUSE}</button>
</header>
<button class="fast-btn left" id="btnFast2" type="button" data-speed="2" aria-label="Hold for double speed" hidden>
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5.5v13l9-6.5zM12 5.5v13l9-6.5z"/></svg>
  <span>Hold 2&times;</span>
</button>
<button class="fast-btn" id="btnFast" type="button" data-speed="3" aria-label="Hold for triple speed" hidden>
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5.5v13l9-6.5zM12 5.5v13l9-6.5z"/></svg>
  <span>Hold 3&times;</span>
</button>
<div class="banner" id="banner" hidden><b id="bannerTitle">Level 1</b><span id="bannerSub"></span></div>

<section class="overlay clear" id="menu">
  <div class="panel">
    <p class="eyebrow">A game of quick switching</p>
    <h1>Switchyard</h1>
    <p class="lede">Trains leave the tunnel one after another. Tap the switches so each train reaches the station of its own color.</p>
    <div class="stepper">
      <button type="button" id="lvDown" aria-label="Lower level">&minus;</button>
      <div><span class="lbl">Level</span><b id="menuLevel">1</b><small id="menuInfo"></small></div>
      <button type="button" id="lvUp" aria-label="Higher level">+</button>
    </div>
    <div class="btn-col">
      <button class="btn primary" type="button" id="btnPlay">Play</button>
      <button class="btn ghost" type="button" id="btnSound"></button>
    </div>
    <p class="fine score-line">Best score <b id="menuBest">0</b> &middot; Route 80% of trains to move up a level</p>
  </div>
</section>

<section class="overlay" id="pause" hidden>
  <div class="panel">
    <p class="eyebrow" id="pauseLevel">Level 1</p>
    <h2>Paused</h2>
    <div class="btn-col">
      <button class="btn primary" type="button" id="btnResume">Resume</button>
      <button class="btn ghost" type="button" id="btnRestart">Restart level</button>
      <button class="btn ghost" type="button" id="btnQuit">Main menu</button>
    </div>
  </div>
</section>

<section class="overlay" id="results" hidden>
  <div class="panel">
    <p class="eyebrow" id="resLevel">Level 1</p>
    <h2 id="resTitle">Level up!</h2>
    <div class="big"><span id="resCorrect">0</span><small>/<span id="resTotal">0</span></small></div>
    <p class="big-cap">trains reached the right station</p>
    <div class="stats">
      <div class="stat"><span class="lbl">Accuracy</span><b id="resAcc">0%</b></div>
      <div class="stat"><span class="lbl">Score</span><b id="resScore">0</b></div>
      <div class="stat" id="resBestBox"><span class="lbl">Best</span><b id="resBest">0</b></div>
    </div>
    <p class="fine" id="resNote"></p>
    <div class="btn-col">
      <button class="btn primary" type="button" id="btnNext">Next level</button>
      <button class="btn ghost" type="button" id="btnMenu">Main menu</button>
    </div>
  </div>
</section>`;

const $ = id => document.getElementById(id);
const canvas = $('board');
const ctx = canvas.getContext('2d');
const staticLayer = document.createElement('canvas');
const fastBtns = [$('btnFast2'), $('btnFast')];

// ---------- sound ----------
const sfx = (() => {
  let ac = null;
  const ensure = () => {
    if (!ac) {
      const A = window.AudioContext || window.webkitAudioContext;
      if (A) { try { ac = new A(); } catch (e) { ac = null; } }
    }
    if (ac && ac.state === 'suspended') ac.resume().catch(() => {});
  };
  const tone = (f, dur, type, vol, at = 0, f2) => {
    if (save.muted || !ac) return;
    const t0 = ac.currentTime + at;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t0);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(ac.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.03);
  };
  return {
    ensure,
    click: () => tone(1500, 0.05, 'square', 0.045, 0, 700),
    depart: () => { tone(466, 0.28, 'sine', 0.05); tone(587, 0.28, 'sine', 0.035); },
    good: () => { tone(784, 0.12, 'triangle', 0.2); tone(1175, 0.22, 'triangle', 0.2, 0.09); },
    bad: () => tone(220, 0.34, 'sawtooth', 0.11, 0, 110),
    win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.2, 'triangle', 0.17, i * 0.11)),
    lose: () => [392, 330, 262].forEach((f, i) => tone(f, 0.24, 'triangle', 0.14, i * 0.15)),
  };
})();

// ---------- state ----------
let state = 'menu';     // menu | play | results
let paused = false;
let speed = 1;             // simulation steps per frame while a speed button is held
const held = new Map();    // hold source -> speed multiplier
let map = null;
let round = null;
let W = 0, H = 0, DPR = 1, S = 40, OX = 0, OY = 0;

function boardIsPortrait() {
  const r = canvas.getBoundingClientRect();
  return r.height > r.width * 1.1;
}

function makeMap(cfg) {
  const portrait = boardIsPortrait();
  return generateMap(portrait ? cfg.rows : cfg.cols, portrait ? cfg.cols : cfg.rows, cfg.houses);
}

function startDemo() {
  const cfg = Object.assign(levelConfig(5), { speed: 1.5, gap: 2.4 });
  map = makeMap(cfg);
  map.portrait = boardIsPortrait();
  round = { demo: true, cfg, level: 0, trains: [], effects: [], spawned: 0, timer: 0.3 };
  layout();
}

function startRound(level) {
  sfx.ensure();
  const cfg = levelConfig(level);
  map = makeMap(cfg);
  const queue = [];
  while (queue.length < cfg.trains) queue.push(...shuffle(map.colors.slice()));
  round = {
    demo: false, cfg, level, queue: shuffle(queue.slice(0, cfg.trains)),
    trains: [], effects: [], spawned: 0, done: 0, correct: 0, score: 0, streak: 0,
    timer: 2.0, endTimer: null,
  };
  state = 'play';
  paused = false;
  $('menu').hidden = true;
  $('results').hidden = true;
  $('pause').hidden = true;
  $('hud').hidden = false;
  for (const b of fastBtns) b.hidden = false;
  clearHold();
  layout();
  updateHud();
  showBanner(`Level ${level}`, `${cfg.houses} stations · ${cfg.trains} trains`);
}

function showBanner(title, sub) {
  const b = $('banner');
  $('bannerTitle').textContent = title;
  $('bannerSub').textContent = sub;
  b.hidden = true;
  void b.offsetWidth; // restart the CSS animation
  b.hidden = false;
  clearTimeout(showBanner.t);
  showBanner.t = setTimeout(() => { b.hidden = true; }, 2100);
}

function updateHud() {
  if (!round || round.demo) return;
  $('hudLevel').textContent = round.level;
  $('hudScore').textContent = round.score.toLocaleString();
  $('hudCorrect').textContent = round.correct;
  $('hudTrains').textContent = `${round.done}/${round.cfg.trains}`;
}

function refreshMenu() {
  save.level = Math.max(1, Math.min(save.level, save.maxLevel));
  const cfg = levelConfig(save.level);
  $('menuLevel').textContent = save.level;
  $('menuInfo').textContent = `${cfg.houses} stations · ${cfg.trains} trains`;
  $('lvDown').disabled = save.level <= 1;
  $('lvUp').disabled = save.level >= save.maxLevel;
  $('menuBest').textContent = save.best.toLocaleString();
  $('btnSound').textContent = save.muted ? 'Sound: off' : 'Sound: on';
}

function showMenu() {
  state = 'menu';
  paused = false;
  $('hud').hidden = true;
  for (const b of fastBtns) b.hidden = true;
  clearHold();
  $('pause').hidden = true;
  $('results').hidden = true;
  $('banner').hidden = true;
  $('menu').hidden = false;
  refreshMenu();
  startDemo();
}

function setPaused(p) {
  if (state !== 'play') return;
  paused = p;
  if (p) clearHold();
  $('pauseLevel').textContent = `Level ${round.level}`;
  $('pause').hidden = !p;
  if (p) $('btnResume').focus({ preventScroll: true });
}

function finishRound() {
  state = 'results';
  const R = round;
  const total = R.cfg.trains;
  const acc = R.correct / total;
  let next = R.level, title, btn, note, cls = '';
  if (acc >= 0.8) {
    next = R.level + 1;
    title = acc === 1 ? 'Perfect run!' : 'Level up!';
    btn = `Play level ${next}`;
    note = `Next up: ${levelConfig(next).houses} stations, faster trains.`;
    cls = 'outcome-up';
    sfx.win();
  } else if (acc >= 0.5) {
    title = 'Almost there';
    btn = 'Try again';
    note = `Route ${Math.ceil(total * 0.8)} of ${total} trains correctly to move up.`;
    sfx.lose();
  } else {
    next = Math.max(1, R.level - 1);
    title = next < R.level ? 'Back one level' : 'Keep practicing';
    btn = `Play level ${next}`;
    note = 'Fewer than half reached the right station. Watch the switch arrows as each train approaches.';
    cls = 'outcome-down';
    sfx.lose();
  }
  const newBest = R.score > save.best;
  if (newBest) save.best = R.score;
  save.level = next;
  save.maxLevel = Math.max(save.maxLevel, next);
  persist();

  $('resLevel').textContent = `Level ${R.level}`;
  $('resTitle').textContent = title;
  $('resTitle').className = cls;
  $('resCorrect').textContent = R.correct;
  $('resTotal').textContent = total;
  $('resAcc').textContent = `${Math.round(acc * 100)}%`;
  $('resScore').textContent = R.score.toLocaleString();
  $('resBest').textContent = save.best.toLocaleString();
  $('resBestBox').classList.toggle('new', newBest);
  $('resBestBox').querySelector('.lbl').textContent = newBest ? 'New best' : 'Best';
  $('resNote').textContent = note;
  $('btnNext').textContent = btn;
  $('hud').hidden = true;
  for (const b of fastBtns) b.hidden = true;
  clearHold();
  $('results').hidden = false;
  $('btnNext').focus({ preventScroll: true });
}

// ---------- simulation ----------
function exitFor(cell) {
  if (cell.type === 'house') return undefined;
  if (cell.type === 'switch') return cell.kids[cell.active];
  return cell.kids[0];
}

function update(dt) {
  const R = round, m = map;
  R.timer -= dt;
  if (R.timer <= 0 && (R.demo || R.spawned < R.cfg.trains)) {
    const color = R.demo ? pick(m.colors) : R.queue[R.spawned];
    R.trains.push({ color, cells: [m.tunnel], exits: [m.tunnel.kids[0]], d: 0, arrived: false });
    R.spawned++;
    R.timer = Math.max(2.3 / R.cfg.speed, R.cfg.gap * rand(0.8, 1.25));
    if (!R.demo) sfx.depart();
  }

  for (const t of R.trains) {
    t.d += R.cfg.speed * dt;
    // A train commits to a switch's direction the moment it rolls onto it.
    while (Math.floor(t.d) >= t.cells.length) {
      const exit = t.exits[t.exits.length - 1];
      if (exit === undefined) break;
      const next = m.neighbor(t.cells[t.cells.length - 1], exit);
      t.cells.push(next);
      t.exits.push(exitFor(next));
    }
    if (R.demo) {
      const i = Math.min(Math.floor(t.d), t.cells.length - 1);
      const exit = t.exits[i];
      if (exit !== undefined) {
        const nx = m.neighbor(t.cells[i], exit);
        if (nx.type === 'switch') {
          const want = nx.kids.findIndex(k => m.neighbor(nx, k).sub.has(t.color.id));
          if (want >= 0) nx.active = want;
        }
      }
    }
    const end = t.cells[t.cells.length - 1];
    if (!t.arrived && end.type === 'house' && t.d >= t.cells.length - 0.5) {
      t.arrived = true;
      arrive(t, end);
    }
  }
  R.trains = R.trains.filter(t => !(t.arrived && t.d - TRAIN_LEN > t.cells.length - 0.5));

  for (const e of R.effects) e.t += dt;
  R.effects = R.effects.filter(e => e.t < 0.9);
  for (const sw of m.switches) sw.pop = Math.max(0, sw.pop - dt * 5);
  for (const h of m.houses) h.flash = Math.max(0, h.flash - dt * 2);

  if (!R.demo && R.spawned === R.cfg.trains && R.trains.length === 0) {
    if (R.endTimer === null) R.endTimer = 0.9;
    R.endTimer -= dt;
    if (R.endTimer <= 0) finishRound();
  }
}

function arrive(t, house) {
  const R = round;
  const ok = t.color === house.color;
  house.flash = 1;
  R.effects.push({ c: house.c, r: house.r, ok, t: 0 });
  if (R.demo) return;
  R.done++;
  if (ok) {
    R.correct++;
    R.score += 100 + 25 * (R.level - 1) + 10 * Math.min(R.streak, 10);
    R.streak++;
    sfx.good();
  } else {
    R.streak = 0;
    sfx.bad();
  }
  updateHud();
}

// ---------- layout ----------
function layout() {
  const rect = canvas.getBoundingClientRect();
  W = rect.width; H = rect.height;
  DPR = Math.min(window.devicePixelRatio || 1, 2.5);
  canvas.width = Math.max(1, Math.round(W * DPR));
  canvas.height = Math.max(1, Math.round(H * DPR));
  if (!map) return;
  const hud = $('hud');
  const top = hud.hidden ? 64 : Math.max(0, hud.getBoundingClientRect().bottom - rect.top) + 6;
  const pad = Math.max(10, Math.min(W, H) * 0.025);
  // Keep the bottom strip clear for the fast-forward button.
  const bottom = Math.max(pad, 84);
  const aw = W - pad * 2, ah = H - top - bottom;
  S = Math.max(10, Math.floor(Math.min(aw / map.cols, ah / map.rows)));
  OX = Math.round((W - S * map.cols) / 2);
  OY = Math.round(top + (ah - S * map.rows) / 2);
  buildStatic();
}

const cx = cell => OX + (cell.c + 0.5) * S;
const cy = cell => OY + (cell.r + 0.5) * S;

// Point along the path through a cell, entering on side a and leaving on side b.
function segPoint(x, y, a, b, t) {
  const h = S / 2;
  const ax = x + DIRS[a][0] * h, ay = y + DIRS[a][1] * h;
  const bx = x + DIRS[b][0] * h, by = y + DIRS[b][1] * h;
  if (b === opp(a)) return [ax + (bx - ax) * t, ay + (by - ay) * t];
  const kx = x + (DIRS[a][0] + DIRS[b][0]) * h, ky = y + (DIRS[a][1] + DIRS[b][1]) * h;
  const a1 = Math.atan2(ay - ky, ax - kx);
  const diff = angleDiff(a1, Math.atan2(by - ky, bx - kx));
  const ang = a1 + diff * t;
  return [kx + Math.cos(ang) * h, ky + Math.sin(ang) * h];
}

function angleDiff(a1, a2) {
  let d = a2 - a1;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function tracePath(g, x, y, a, b, o, tEnd) {
  const h = S / 2;
  if (b === opp(a)) {
    const dx = DIRS[b][0], dy = DIRS[b][1];
    const sx = x - dx * h - dy * o, sy = y - dy * h + dx * o;
    g.moveTo(sx, sy);
    g.lineTo(sx + dx * S * tEnd, sy + dy * S * tEnd);
  } else {
    const kx = x + (DIRS[a][0] + DIRS[b][0]) * h, ky = y + (DIRS[a][1] + DIRS[b][1]) * h;
    const a1 = Math.atan2(DIRS[a][1] * h + y - ky, DIRS[a][0] * h + x - kx);
    const a2 = Math.atan2(DIRS[b][1] * h + y - ky, DIRS[b][0] * h + x - kx);
    const diff = angleDiff(a1, a2);
    const rad = h + o;
    g.moveTo(kx + Math.cos(a1) * rad, ky + Math.sin(a1) * rad);
    g.arc(kx, ky, rad, a1, a1 + diff * tEnd, diff < 0);
  }
}

function drawSegment(g, cell, a, b, tEnd = 1, alpha = 1) {
  const x = cx(cell), y = cy(cell);
  g.save();
  g.globalAlpha = alpha;
  g.lineCap = 'butt';
  g.beginPath();
  tracePath(g, x, y, a, b, 0, tEnd);
  g.strokeStyle = C.ballast;
  g.lineWidth = S * 0.46;
  g.stroke();
  g.setLineDash([S * 0.075, S * 0.125]);
  g.lineDashOffset = -S * 0.02;
  g.strokeStyle = C.tie;
  g.lineWidth = S * 0.36;
  g.stroke();
  g.setLineDash([]);
  g.beginPath();
  tracePath(g, x, y, a, b, S * 0.115, tEnd);
  tracePath(g, x, y, a, b, -S * 0.115, tEnd);
  g.strokeStyle = C.rail;
  g.lineWidth = Math.max(2, S * 0.058);
  g.stroke();
  g.strokeStyle = C.railHi;
  g.lineWidth = Math.max(1, S * 0.022);
  g.stroke();
  g.restore();
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function drawDecor(g, d) {
  const x = OX + (d.c + 0.5 + d.ox) * S, y = OY + (d.r + 0.5 + d.oy) * S, s = S * d.s;
  if (d.kind === 'tree') {
    g.fillStyle = 'rgba(0,0,0,.16)';
    g.beginPath(); g.ellipse(x + s * 0.08, y + s * 0.12, s * 0.3, s * 0.22, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = C.leafDark;
    g.beginPath(); g.arc(x, y, s * 0.28, 0, Math.PI * 2); g.fill();
    g.fillStyle = C.leaf;
    g.beginPath(); g.arc(x - s * 0.06, y - s * 0.06, s * 0.21, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,.12)';
    g.beginPath(); g.arc(x - s * 0.1, y - s * 0.11, s * 0.09, 0, Math.PI * 2); g.fill();
  } else if (d.kind === 'bush') {
    g.fillStyle = C.leafDark;
    for (const [dx, dy, rr] of [[-0.1, 0.02, 0.12], [0.08, 0.03, 0.11], [0, -0.06, 0.12]]) {
      g.beginPath(); g.arc(x + dx * s, y + dy * s, rr * s, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = C.leaf;
    g.beginPath(); g.arc(x - s * 0.02, y - s * 0.08, s * 0.07, 0, Math.PI * 2); g.fill();
  } else if (d.kind === 'flowers') {
    const cols = ['#fff6d8', '#ffd84a', '#ff9fc4', '#c9b6ff'];
    for (let i = 0; i < 5; i++) {
      const ang = d.hue * 6 + i * 1.3, rr = s * (0.06 + (i % 3) * 0.07);
      g.fillStyle = cols[(i + Math.floor(d.hue * 4)) % cols.length];
      g.beginPath(); g.arc(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr, s * 0.035, 0, Math.PI * 2); g.fill();
    }
  } else {
    g.fillStyle = 'rgba(0,0,0,.15)';
    g.beginPath(); g.ellipse(x + s * 0.04, y + s * 0.05, s * 0.15, s * 0.1, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = C.rock;
    g.beginPath(); g.ellipse(x, y, s * 0.14, s * 0.1, 0.3, 0, Math.PI * 2); g.fill();
  }
}

function buildStatic() {
  staticLayer.width = canvas.width;
  staticLayer.height = canvas.height;
  const g = staticLayer.getContext('2d');
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  g.fillStyle = C.grass;
  g.fillRect(0, 0, W, H);
  for (const p of map.patches) {
    g.fillStyle = p.light ? C.grassLight : C.grassDark;
    g.globalAlpha = 0.35;
    g.beginPath();
    g.ellipse(OX + p.x * S, OY + p.y * S, p.rx * S, p.ry * S, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  for (const d of map.decor) drawDecor(g, d);
  for (const cell of map.cells) {
    if (cell.type === 'track' || cell.type === 'tunnel') drawSegment(g, cell, cell.entry, cell.kids[0]);
    else if (cell.type === 'house') drawSegment(g, cell, cell.entry, opp(cell.entry), 0.5);
  }
}

// ---------- drawing ----------
function drawSwitch(sw) {
  const off = sw.kids[1 - sw.active], on = sw.kids[sw.active];
  drawSegment(ctx, sw, sw.entry, off, 1, 0.42);
  drawSegment(ctx, sw, sw.entry, on, 1, 1);
}

function drawSwitchButton(sw) {
  const x = cx(sw), y = cy(sw);
  const on = sw.kids[sw.active];
  const r = S * (0.2 + sw.pop * 0.05);
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,.25)';
  ctx.beginPath(); ctx.arc(S * 0.02, S * 0.035, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fdfcf7';
  ctx.strokeStyle = '#2a3442';
  ctx.lineWidth = Math.max(1.5, S * 0.04);
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.rotate(Math.atan2(DIRS[on][1], DIRS[on][0]));
  ctx.fillStyle = '#2a3442';
  ctx.beginPath();
  ctx.moveTo(r * 0.62, 0);
  ctx.lineTo(-r * 0.2, -r * 0.5);
  ctx.lineTo(-r * 0.05, 0);
  ctx.lineTo(-r * 0.2, r * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function posAt(t, dist) {
  const i = Math.min(Math.floor(dist), t.cells.length - 1);
  const cell = t.cells[i];
  const a = cell.entry;
  const b = t.exits[i] === undefined ? opp(a) : t.exits[i];
  return segPoint(cx(cell), cy(cell), a, b, Math.min(1, dist - i));
}

function drawCar(x, y, ang, color, engine) {
  const L = S * (engine ? 0.52 : 0.46), Wd = S * 0.34, r = S * 0.07;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.fillStyle = 'rgba(0,0,0,.24)';
  roundRect(ctx, -L / 2 + S * 0.03, -Wd / 2 + S * 0.045, L, Wd, r); ctx.fill();
  ctx.fillStyle = color.fill;
  ctx.strokeStyle = color.dark;
  ctx.lineWidth = Math.max(1.2, S * 0.032);
  roundRect(ctx, -L / 2, -Wd / 2, L, Wd, r); ctx.fill(); ctx.stroke();
  if (engine) {
    ctx.fillStyle = color.dark;
    roundRect(ctx, -L / 2 + S * 0.045, -Wd / 2 + S * 0.05, L * 0.36, Wd - S * 0.1, S * 0.035); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.8)';
    roundRect(ctx, -L / 2 + S * 0.075, -Wd / 2 + S * 0.085, L * 0.16, Wd - S * 0.17, S * 0.025); ctx.fill();
    ctx.fillStyle = '#25262c';
    ctx.beginPath(); ctx.arc(L * 0.2, 0, S * 0.058, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffe9a3';
    ctx.beginPath(); ctx.arc(L / 2 - S * 0.035, 0, S * 0.035, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.fillStyle = 'rgba(255,255,255,.3)';
    roundRect(ctx, -L / 2 + S * 0.05, -Wd / 2 + S * 0.06, L - S * 0.1, Wd * 0.26, S * 0.03); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.18)';
    ctx.lineWidth = Math.max(1, S * 0.02);
    ctx.beginPath();
    ctx.moveTo(-L * 0.12, -Wd / 2 + S * 0.04); ctx.lineTo(-L * 0.12, Wd / 2 - S * 0.04);
    ctx.moveTo(L * 0.12, -Wd / 2 + S * 0.04); ctx.lineTo(L * 0.12, Wd / 2 - S * 0.04);
    ctx.stroke();
  }
  ctx.restore();
}

function drawTrain(t) {
  const end = t.cells[t.cells.length - 1];
  const stop = end.type === 'house' ? t.cells.length - 0.55 : Infinity;
  for (let k = TRAIN_OFFSETS.length - 1; k >= 0; k--) {
    const dist = t.d - TRAIN_OFFSETS[k];
    if (dist < 0.02 || dist > stop) continue;
    const [x, y] = posAt(t, dist);
    const [x2, y2] = posAt(t, dist + 0.04);
    drawCar(x, y, Math.atan2(y2 - y, x2 - x), t.color, k === 0);
  }
}

function drawHouse(h) {
  const x = cx(h), y = cy(h), s = S;
  const col = h.color;
  ctx.save();
  ctx.translate(x, y + s * 0.02);
  if (h.flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${0.45 * h.flash})`;
    ctx.beginPath(); ctx.arc(0, 0, s * (0.45 + (1 - h.flash) * 0.15), 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = 'rgba(0,0,0,.22)';
  roundRect(ctx, -s * 0.28, -s * 0.04, s * 0.62, s * 0.4, s * 0.04); ctx.fill();
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1.2, s * 0.03);
  ctx.strokeStyle = col.dark;
  ctx.fillStyle = col.fill;
  roundRect(ctx, -s * 0.3, -s * 0.08, s * 0.6, s * 0.4, s * 0.035); ctx.fill(); ctx.stroke();
  ctx.fillStyle = col.dark;
  ctx.beginPath();
  ctx.moveTo(-s * 0.4, -s * 0.06);
  ctx.lineTo(0, -s * 0.4);
  ctx.lineTo(s * 0.4, -s * 0.06);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = col.fill;
  ctx.globalAlpha = 0.35;
  ctx.beginPath();
  ctx.moveTo(-s * 0.26, -s * 0.1);
  ctx.lineTo(0, -s * 0.32);
  ctx.lineTo(s * 0.26, -s * 0.1);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(30,24,20,.75)';
  roundRect(ctx, -s * 0.07, s * 0.1, s * 0.14, s * 0.22, s * 0.03); ctx.fill();
  ctx.fillStyle = 'rgba(255,248,214,.9)';
  ctx.fillRect(-s * 0.23, s * 0.0, s * 0.1, s * 0.09);
  ctx.fillRect(s * 0.13, s * 0.0, s * 0.1, s * 0.09);
  ctx.restore();
}

function drawTunnel(t) {
  const h = S / 2;
  ctx.save();
  ctx.translate(cx(t), cy(t));
  ctx.rotate(t.entry * Math.PI / 2); // local "up" points out of the board
  ctx.fillStyle = '#5d6b55';
  ctx.beginPath(); ctx.ellipse(0, -h - S * 0.05, S * 0.62, S * 0.48, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#6f7d66';
  ctx.beginPath(); ctx.ellipse(-S * 0.1, -h - S * 0.12, S * 0.42, S * 0.3, 0, 0, Math.PI * 2); ctx.fill();
  const arch = (w, top, bottom) => {
    ctx.beginPath();
    ctx.moveTo(-w, bottom);
    ctx.lineTo(-w, top);
    ctx.arc(0, top, w, Math.PI, 0);
    ctx.lineTo(w, bottom);
    ctx.closePath();
  };
  ctx.fillStyle = '#9ea2a6';
  arch(S * 0.34, -h + S * 0.12, -h + S * 0.44);
  ctx.fill();
  ctx.strokeStyle = '#6b7075';
  ctx.lineWidth = Math.max(1, S * 0.025);
  ctx.stroke();
  ctx.fillStyle = '#17191d';
  arch(S * 0.24, -h + S * 0.14, -h + S * 0.44);
  ctx.fill();
  ctx.restore();
}

function drawEffect(e) {
  const p = e.t / 0.9;
  const x = OX + (e.c + 0.5) * S;
  const y = OY + (e.r + 0.5) * S - S * 0.55 - p * S * 0.35;
  const r = S * 0.2;
  ctx.save();
  ctx.globalAlpha = 1 - p * p;
  ctx.fillStyle = e.ok ? C.ok : C.bad;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = Math.max(1.5, S * 0.035);
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.lineWidth = Math.max(2, S * 0.05);
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (e.ok) {
    ctx.moveTo(x - r * 0.45, y + r * 0.02);
    ctx.lineTo(x - r * 0.1, y + r * 0.38);
    ctx.lineTo(x + r * 0.48, y - r * 0.32);
  } else {
    ctx.moveTo(x - r * 0.38, y - r * 0.38); ctx.lineTo(x + r * 0.38, y + r * 0.38);
    ctx.moveTo(x + r * 0.38, y - r * 0.38); ctx.lineTo(x - r * 0.38, y + r * 0.38);
  }
  ctx.stroke();
  ctx.restore();
}

function render() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(staticLayer, 0, 0);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  for (const sw of map.switches) drawSwitch(sw);
  for (const sw of map.switches) drawSwitchButton(sw);
  if (round) for (const t of round.trains) drawTrain(t);
  for (const h of map.houses) drawHouse(h);
  drawTunnel(map.tunnel);
  if (round) for (const e of round.effects) drawEffect(e);
}

// ---------- input ----------
function switchAt(e) {
  if (!map) return null;
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left - OX) / S, y = (e.clientY - rect.top - OY) / S;
  let best = null, bd = 0.8;
  for (const sw of map.switches) {
    const d = Math.hypot(x - (sw.c + 0.5), y - (sw.r + 0.5));
    if (d < bd) { bd = d; best = sw; }
  }
  return best;
}

canvas.addEventListener('pointerdown', e => {
  if (state !== 'play' || paused) return;
  e.preventDefault();
  const sw = switchAt(e);
  if (!sw) return;
  sw.active = 1 - sw.active;
  sw.pop = 1;
  // A train whose nose is on the switch right now follows the new direction.
  for (const t of round.trains) {
    const i = Math.floor(t.d);
    if (i === t.cells.length - 1 && t.cells[i] === sw) t.exits[i] = exitFor(sw);
  }
  sfx.click();
});
canvas.addEventListener('pointermove', e => {
  if (e.pointerType !== 'mouse') return;
  canvas.style.cursor = state === 'play' && !paused && switchAt(e) ? 'pointer' : 'default';
});
canvas.addEventListener('contextmenu', e => e.preventDefault());

$('btnPlay').addEventListener('click', () => startRound(save.level));
$('lvDown').addEventListener('click', () => { save.level--; refreshMenu(); persist(); });
$('lvUp').addEventListener('click', () => { save.level++; refreshMenu(); persist(); });
$('btnSound').addEventListener('click', () => {
  save.muted = !save.muted;
  persist();
  sfx.ensure();
  refreshMenu();
  sfx.click();
});
$('btnPause').addEventListener('click', () => setPaused(true));

// Holding several speed controls at once uses the fastest one.
function setHold(src, mul) {
  if (mul && state === 'play' && !paused) held.set(src, mul);
  else held.delete(src);
  syncSpeed();
}
function clearHold() {
  held.clear();
  syncSpeed();
}
function syncSpeed() {
  speed = Math.max(1, ...held.values());
  const holds = [...held];
  for (const b of fastBtns) {
    const mul = Number(b.dataset.speed);
    b.classList.toggle('on', holds.some(([src, m]) => src === b.id || (src.startsWith('key:') && m === mul)));
  }
}
for (const btn of fastBtns) {
  const mul = Number(btn.dataset.speed);
  btn.addEventListener('pointerdown', e => {
    e.preventDefault();
    sfx.ensure();
    try { btn.setPointerCapture(e.pointerId); } catch (err) { /* capture unsupported */ }
    setHold(btn.id, mul);
  });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) btn.addEventListener(ev, () => setHold(btn.id, 0));
  btn.addEventListener('contextmenu', e => e.preventDefault());
}
window.addEventListener('blur', clearHold);
$('btnResume').addEventListener('click', () => setPaused(false));
$('btnRestart').addEventListener('click', () => startRound(round.level));
$('btnQuit').addEventListener('click', showMenu);
$('btnNext').addEventListener('click', () => startRound(save.level));
$('btnMenu').addEventListener('click', showMenu);

document.addEventListener('keyup', e => {
  const k = e.key.toLowerCase();
  if (KEY_SPEEDS[k]) setHold('key:' + k, 0);
});
document.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (KEY_SPEEDS[k] && state === 'play') {
    e.preventDefault();
    if (!e.repeat) setHold('key:' + k, KEY_SPEEDS[k]);
  } else if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
    if (state === 'play') setPaused(!paused);
  } else if ((e.key === 'Enter' || e.key === ' ') && state === 'menu' && document.activeElement === document.body) {
    e.preventDefault();
    startRound(save.level);
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === 'play' && !paused) setPaused(true);
});

let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    // The demo board re-plans itself if the screen flips between portrait and landscape.
    if (state === 'menu' && map && map.portrait !== boardIsPortrait()) startDemo();
    else layout();
  }, 80);
});

// ---------- main loop ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (round && !paused && state !== 'results') {
    // Fast-forward runs extra simulation steps so trains never skip a switch.
    const steps = speed;
    for (let i = 0; i < steps && state !== 'results'; i++) update(dt);
  }
  if (map && S > 0) render();
  requestAnimationFrame(frame);
}

showMenu();
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => layout());
requestAnimationFrame(frame);
})();
