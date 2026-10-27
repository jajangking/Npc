// ============================================================
// VIEWER — klien tipis untuk server persisten.
// Simulasi jalan di server; halaman ini cuma "jendela" ke desa:
// terima snapshot lewat WebSocket, gambar dengan renderer iso
// yang sama, dan kirim kontrol/klik balik ke server.
// ============================================================
import { W, H, DAY, SEASON_DAYS, SEASONS, T } from './world.js';
import { ACTIONS } from './actions.js';
import { render, pickNpc, screenToWorld, CANVAS_W, CANVAS_H } from './render.js';
import { renderInspector, renderLog, renderStats, renderClock } from './ui.js';
import { PROFS, FLAG } from './proto.js';

const ACTION_IDS = Object.keys(ACTIONS);

const canvas = document.getElementById('world');
canvas.width = CANVAS_W;
canvas.height = CANVAS_H;
const ctx = canvas.getContext('2d');
const elInspector = document.getElementById('inspector');
const elLog = document.getElementById('log');
const elStats = document.getElementById('stats-bar');
const elClock = document.getElementById('clock');
const elConn = document.getElementById('conn');

// ---------- shim dunia & sim (bentuknya meniru Sim asli) ----------
let lastTick = 0, lastDynAt = 0, tickRate = 60 / 1000;

const world = {
  tiles: new Array(W * H).fill(null).map(() => ({ type: 0 })),
  traffic: new Float32Array(W * H),
  market: { x: 32, y: 23 },
  get tick() {
    return Math.floor(lastTick + Math.min(400, (performance.now() - lastDynAt) * tickRate));
  },
  get day() { return Math.floor(this.tick / DAY); },
  get hour() { return ((this.tick % DAY) / DAY) * 24; },
  get isNight() { const h = this.hour; return h >= 20 || h < 5.5; },
  get seasonName() { return SEASONS[Math.floor(this.day / SEASON_DAYS) % 4]; },
  at(x, y) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= W || y >= H) return null;
    return this.tiles[y * W + x];
  },
};

const sim = {
  world,
  npcs: [],
  wolves: [],
  logs: [],
  stats: { births: 0, deaths: 0, weddings: 0 },
  know: { tani: 0, kayu: 0, konstruksi: 0, dagang: 0 },
  techs: new Set(),
  market: { prices: { food: 2, wood: 1.5 } },
  memeCounts: {},
  leader: null,
  kedai: null,
  park: null,
  festivalActive: false,
  countMeme(id) { return this.memeCounts[id] || 0; },
  npcWarung(n) { return n && n._hasWarung ? {} : null; },
};

const names = new Map();   // id -> nama (dari meta)
const npcById = new Map(); // id -> objek npc shim (posisi diinterpolasi)
let selectedId = null;
let detail = null;         // data inspektor dari server
let paused = false, speed = 1;

function hydrateDyn(m) {
  const now = performance.now();
  if (lastDynAt) {
    const dt = now - lastDynAt;
    if (dt > 20) tickRate = tickRate * 0.6 + ((m.tick - lastTick) / dt) * 0.4;
  }
  lastTick = m.tick; lastDynAt = now;
  sim.festivalActive = m.fest;
  sim.park = m.park;
  paused = m.paused; speed = m.speed;
  syncButtons();

  const seen = new Set();
  sim.npcs = m.npcs.map(([id, x, y, profIdx, flags, actIdx]) => {
    seen.add(id);
    let n = npcById.get(id);
    if (!n) {
      n = { id, x, y, _fx: x, _fy: y, _tx: x, _ty: y, _t0: now };
      npcById.set(id, n);
    } else {
      n._fx = n.x; n._fy = n.y; n._tx = x; n._ty = y; n._t0 = now;
    }
    n.alive = true;
    n.name = names.get(id) || '…';
    n.isAdult = !!(flags & FLAG.ADULT);
    n.asleep = !!(flags & FLAG.ASLEEP);
    n.cart = !!(flags & FLAG.CART);
    n.sex = (flags & FLAG.FEMALE) ? 'P' : 'L';
    n.home = (flags & FLAG.HOME) ? { x: 0, y: 0 } : null;
    n.path = (flags & FLAG.MOVING) ? [0] : null;
    n.pathIdx = 0;
    n.profession = PROFS[profIdx] || 'warga';
    n.action = actIdx >= 0 ? { id: ACTION_IDS[actIdx] } : null;
    return n;
  });
  for (const [id] of npcById) if (!seen.has(id)) npcById.delete(id);
  sim.wolves = m.wolves.map(([x, y]) => ({ x, y }));
  if (selectedId != null && !seen.has(selectedId)) { selectedId = null; detail = null; }
}

function hydrateWorld(m) {
  world.tiles = m.tiles;
  world.traffic = Float32Array.from(m.traffic, v => v / 10);
  world.market = m.market;
}

function hydrateMeta(m) {
  names.clear();
  for (const [id, nm] of m.roster) names.set(id, nm);
  sim.stats = m.stats;
  sim.know = m.know;
  sim.techs = new Set(m.techs);
  sim.market.prices = m.prices;
  sim.memeCounts = m.memeCounts;
  sim.leader = m.leader;
  sim.logs = m.logs;
}

function hydrateDetail(d) {
  if (!d) { detail = null; return; }
  detail = {
    ...d,
    action: d.actionId ? { id: d.actionId } : null,
    partner: d.partnerName ? { name: d.partnerName } : null,
    home: d.home ? { x: 0, y: 0 } : null,
    farm: d.farm ? {} : null,
    opinions: new Map(d.opinions),
    memes: new Set(d.memes),
    _hasWarung: d.hasWarung,
  };
  // shim utk tag pemilik kedai & kades di inspektor
  sim.kedai = d.isKedaiOwner ? { owner: d.id } : sim.kedai && sim.kedai.owner === d.id ? null : sim.kedai;
}

// ---------- WebSocket + reconnect ----------
let ws = null, retry = 800;
function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onopen = () => { retry = 800; elConn.textContent = '🟢'; elConn.title = 'terhubung ke server'; };
  ws.onclose = () => {
    elConn.textContent = '🔴'; elConn.title = 'terputus — mencoba lagi...';
    setTimeout(connect, retry);
    retry = Math.min(8000, retry * 1.6);
  };
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.t === 'dyn') hydrateDyn(m);
    else if (m.t === 'world') hydrateWorld(m);
    else if (m.t === 'meta') hydrateMeta(m);
    else if (m.t === 'npc') hydrateDetail(m.data);
  };
}
connect();
const send = (o) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); };

// ---------- kontrol ----------
const btnPause = document.getElementById('btn-pause');
btnPause.onclick = () => send({ t: 'ctl', pause: !paused });
for (const [id, sp] of [['btn-1x', 1], ['btn-4x', 4], ['btn-16x', 16]]) {
  document.getElementById(id).onclick = () => send({ t: 'ctl', speed: sp });
}
document.getElementById('btn-reset').onclick = () => {
  if (confirm('Mulai dunia BARU di server? Desa yang sekarang akan hilang untuk semua penonton.')) {
    send({ t: 'ctl', reset: true });
    selectedId = null; detail = null;
  }
};
function syncButtons() {
  btnPause.textContent = paused ? '▶' : '⏸';
  btnPause.classList.toggle('active', paused);
  for (const [id, sp] of [['btn-1x', 1], ['btn-4x', 4], ['btn-16x', 16]]) {
    document.getElementById(id).classList.toggle('speed', true);
    document.getElementById(id).classList.toggle('active', speed === sp && !paused);
  }
}

canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect();
  const px = ((e.clientX - rect.left) / rect.width) * CANVAS_W;
  const py = ((e.clientY - rect.top) / rect.height) * CANVAS_H;
  const wpt = screenToWorld(px, py);
  const hit = pickNpc(sim, wpt.x, wpt.y);
  selectedId = hit ? hit.id : null;
  detail = null;
  send({ t: 'sel', id: selectedId });
});

// ---------- loop gambar (interpolasi posisi antar snapshot) ----------
let frame = 0;
function loop() {
  const now = performance.now();
  for (const n of npcById.values()) {
    const k = Math.min(1, (now - n._t0) / 130);
    n.x = n._fx + (n._tx - n._fx) * k;
    n.y = n._fy + (n._ty - n._fy) * k;
  }
  const sel = selectedId != null ? npcById.get(selectedId) : null;
  render(ctx, sim, sel || null);
  frame++;
  if (frame % 12 === 0) {
    renderInspector(elInspector, sim, detail);
    renderLog(elLog, sim);
    renderStats(elStats, sim);
  }
  renderClock(elClock, sim);
  requestAnimationFrame(loop);
}
loop();
