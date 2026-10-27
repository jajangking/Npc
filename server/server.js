// ============================================================
// DESA HIDUP — SERVER PERSISTEN
// Simulasi jalan headless di Node 24 jam; browser hanya viewer
// lewat WebSocket. Autosave ke disk supaya desa selamat dari
// restart. Jalankan:  node server/server.js   (PORT=3000)
// ============================================================
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

import { Sim } from '../src/sim.js';
import { T } from '../src/world.js';
import { ACTIONS } from '../src/actions.js';
import { serializeSim, restoreSim } from '../src/persist.js';
import { PROFS, FLAG } from '../src/proto.js';
import { MEME_POOL } from '../src/social.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const SAVE_FILE = path.join(DATA_DIR, 'save.json');
const PORT = Number(process.env.PORT || 3000);
const BASE_TPS = 60;              // 1× = sama dengan browser (60 tick/detik)
const AUTOSAVE_MS = 120_000;      // simpan tiap 2 menit

const ACTION_IDS = Object.keys(ACTIONS);

// ---------- muat / buat dunia ----------
let sim;
try {
  if (fs.existsSync(SAVE_FILE)) {
    sim = restoreSim(JSON.parse(fs.readFileSync(SAVE_FILE, 'utf8')));
    console.log(`💾 Save dimuat — hari ${sim.world.day}, ${sim.npcs.length} warga, seed ${sim.seed}`);
    sim.log('💾 Desa bangun kembali dari lelap server', 'info');
  }
} catch (e) {
  console.error('⚠️ Gagal muat save, mulai dunia baru:', e.message);
}
if (!sim) {
  sim = new Sim((Math.random() * 1e9) | 0);
  console.log(`🌍 Dunia baru, seed ${sim.seed}`);
}

let speed = 1;
let paused = false;

// ---------- loop simulasi (akumulator waktu-nyata) ----------
let carry = 0;
let last = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = Math.min(0.5, (now - last) / 1000);
  last = now;
  if (paused) return;
  carry += dt * BASE_TPS * speed;
  let n = Math.min(1200, Math.floor(carry));
  carry -= n;
  while (n-- > 0) sim.step();
}, 50);

// ---------- autosave ----------
function save() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = SAVE_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(serializeSim(sim)));
    fs.renameSync(tmp, SAVE_FILE);
  } catch (e) {
    console.error('⚠️ Autosave gagal:', e.message);
  }
}
setInterval(save, AUTOSAVE_MS);
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log(`\n💾 ${sig} — menyimpan desa lalu pamit...`);
    save();
    process.exit(0);
  });
}

// ---------- pesan snapshot ----------
function worldMsg() {
  const w = sim.world;
  return JSON.stringify({
    t: 'world',
    tiles: w.tiles,
    traffic: Array.from(w.traffic, v => Math.min(255, Math.round(v * 10))),
    market: w.market,
  });
}

function npcFlags(n) {
  let f = 0;
  if (n.isAdult) f |= FLAG.ADULT;
  if (n.asleep) f |= FLAG.ASLEEP;
  if (n.cart) f |= FLAG.CART;
  if (n.sex === 'P') f |= FLAG.FEMALE;
  if (n.path && n.pathIdx < (n.path?.length || 0)) f |= FLAG.MOVING;
  if (n.home) f |= FLAG.HOME;
  return f;
}

function dynMsg() {
  return JSON.stringify({
    t: 'dyn',
    tick: sim.world.tick,
    fest: sim.festivalActive,
    park: sim.park,
    paused, speed,
    npcs: sim.npcs.map(n => [
      n.id,
      Math.round(n.x * 50) / 50, Math.round(n.y * 50) / 50,
      PROFS.indexOf(n.profession),
      npcFlags(n),
      n.action ? ACTION_IDS.indexOf(n.action.id) : -1,
    ]),
    wolves: sim.wolves.map(w => [Math.round(w.x * 50) / 50, Math.round(w.y * 50) / 50]),
  });
}

function metaMsg() {
  const memeCounts = {};
  for (const m of MEME_POOL) {
    const c = sim.countMeme(m.id);
    if (c > 0) memeCounts[m.id] = c;
  }
  return JSON.stringify({
    t: 'meta',
    roster: sim.npcs.map(n => [n.id, n.name]),
    stats: sim.stats,
    know: sim.know,
    techs: [...sim.techs],
    prices: sim.market.prices,
    memeCounts,
    leader: sim.leader,
    logs: sim.logs.slice(-80),
  });
}

function npcDetail(id) {
  const n = sim.npcs.find(x => x.id === id && x.alive);
  if (!n) return JSON.stringify({ t: 'npc', data: null });
  return JSON.stringify({
    t: 'npc',
    data: {
      id: n.id, name: n.name, surname: n.surname, sex: n.sex, age: n.age,
      profession: n.profession, alive: true,
      actionId: n.action ? n.action.id : null,
      partnerName: n.partner?.alive ? n.partner.name : null,
      home: !!n.home, farm: !!n.farm, thought: n.thought,
      needs: n.needs, traits: n.traits, skills: n.skills,
      inv: n.inv, cart: n.cart, q: n.q,
      spots: n.spots.map(s => ({ kind: s.kind, est: s.est })),
      dangers: n.dangers.map(d => ({ x: d.x, y: d.y, mag: d.mag })),
      opinions: [...n.opinions.entries()].map(([oid, o]) => [oid, { aff: o.aff }]),
      memes: [...n.memes],
      lifeEvents: n.lifeEvents.slice(-8),
      hasWarung: !!sim.npcWarung(n),
      isKedaiOwner: !!(sim.kedai && sim.kedai.owner === n.id),
      isLeader: sim.leader === n.id,
    },
  });
}

// ---------- HTTP statis (hasil `vite build`) ----------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.json': 'application/json', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};
const server = http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (p === '/' || p === '') p = '/viewer.html';
  const file = path.normalize(path.join(DIST, p));
  if (!file.startsWith(DIST)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) {
      // fallback SPA → viewer
      fs.readFile(path.join(DIST, 'viewer.html'), (e2, b2) => {
        if (e2) { res.writeHead(404); return res.end('404 — jalankan `npm run build` dulu'); }
        res.writeHead(200, { 'Content-Type': MIME['.html'] });
        res.end(b2);
      });
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
});

// ---------- WebSocket ----------
const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', (ws) => {
  ws._sel = null;
  ws.send(JSON.stringify({ t: 'hello', proto: 1 }));
  ws.send(worldMsg());
  ws.send(metaMsg());
  ws.send(dynMsg());
  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (m.t === 'sel') {
      ws._sel = typeof m.id === 'number' ? m.id : null;
      if (ws._sel != null) ws.send(npcDetail(ws._sel));
    } else if (m.t === 'ctl') {
      if (m.pause !== undefined) paused = !!m.pause;
      if ([1, 4, 16].includes(m.speed)) { speed = m.speed; paused = false; }
      if (m.reset) {
        sim = new Sim((Math.random() * 1e9) | 0);
        console.log(`🌍 Dunia baru diminta viewer, seed ${sim.seed}`);
        save();
        broadcast(worldMsg());
        broadcast(metaMsg());
      }
    }
  });
});

function broadcast(str) {
  for (const c of wss.clients) if (c.readyState === 1) c.send(str);
}

// siaran berkala — hanya kalau ada penonton
setInterval(() => { if (wss.clients.size) broadcast(dynMsg()); }, 120);
setInterval(() => { if (wss.clients.size) broadcast(metaMsg()); }, 1000);
setInterval(() => { if (wss.clients.size) broadcast(worldMsg()); }, 2500);
setInterval(() => {
  for (const c of wss.clients) {
    if (c.readyState === 1 && c._sel != null) c.send(npcDetail(c._sel));
  }
}, 400);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🏰 Desa Hidup persisten jalan di http://0.0.0.0:${PORT} (ws: /ws)`);
  console.log(`   Autosave tiap ${AUTOSAVE_MS / 1000}s → ${SAVE_FILE}`);
});
