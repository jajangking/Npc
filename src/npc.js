import { clamp, dist } from './rng.js';
import { T } from './world.js';

let NEXT_ID = 1;
export function resetIds() { NEXT_ID = 1; }

// ============================================================
// NPC — agen otonom.
// Tidak ada perilaku yang discript: dia menilai dunia lewat
// kebutuhan + sifat + memori + pelajaran, lalu memilih sendiri.
// ============================================================
export class NPC {
  constructor(rng, nameGen, opts = {}) {
    this.id = NEXT_ID++;
    this.rng = rng;
    this.sex = opts.sex || (rng.chance(0.5) ? 'L' : 'P');
    this.firstName = nameGen.first(this.sex);
    this.surname = opts.surname || nameGen.surname();
    this.name = this.firstName;
    this.age = opts.age ?? rng.int(16, 28);       // tahun (1 hari sim = 1 tahun)
    this.alive = true;

    this.x = opts.x ?? 0;
    this.y = opts.y ?? 0;
    this.speed = 0.075;

    // ---- Kebutuhan (0–100) ----
    this.needs = {
      hunger: rng.range(55, 85),   // 0 = kelaparan parah
      energy: rng.range(60, 90),
      social: rng.range(40, 80),
    };
    this.starveTicks = 0;
    this.asleep = false;

    // ---- Sifat bawaan (0–1) — bisa diwariskan & bermutasi ----
    const g = (m) => clamp(m + rng.gauss(0, 0.18), 0.05, 0.95);
    this.traits = opts.traits || {
      rajin: g(0.5),       // suka bekerja & menimbun
      supel: g(0.5),       // butuh & pandai bersosial
      berani: g(0.5),      // tahan terhadap rasa takut
      penasaran: g(0.5),   // suka menjelajah & mencoba hal baru
    };

    // ---- Keahlian (tumbuh karena dipakai → profesi muncul sendiri) ----
    this.skills = opts.skills || {
      tani: rng.range(0.05, 0.3), ramu: rng.range(0.05, 0.3),
      kayu: rng.range(0.05, 0.3), pancing: rng.range(0.05, 0.3),
      dagang: rng.range(0.05, 0.3), pesona: rng.range(0.05, 0.3),
    };

    // ---- Harta ----
    this.inv = { food: opts.food ?? 4, wood: 0, coins: opts.coins ?? 10 };

    // ---- Memori ----
    this.spots = [];        // {x,y,kind,est,lastSeen} — lokasi sumber daya yang DIA TAHU
    this.dangers = [];      // {x,y,mag} — trauma lokasi, meluruh seiring waktu
    this.opinions = new Map(); // id -> {aff, meets}
    this.memes = new Set(); // kebiasaan budaya yang dia anut
    this.lifeEvents = [];   // catatan hidup untuk inspeksi

    // ---- Pembelajaran: nilai-Q per aksi (seberapa "worth it" menurut pengalaman) ----
    this.q = {};

    // ---- Keluarga & properti ----
    this.cart = false;      // gerobak pribadi (teknologi)
    this.partner = null;
    this.parents = opts.parents || null;
    this.children = [];
    this.home = null;       // {x,y} tile rumah
    this.farm = null;       // tile ladang milik sendiri

    // ---- Aksi berjalan ----
    this.action = null;     // {id, state...}
    this.thought = 'baru tiba di desa';
    this.blockedTicks = 0;
    this.fleeTarget = null;
  }

  get isAdult() { return this.age >= 14; }
  get isElder() { return this.age >= 60; }

  get profession() {
    if (!this.isAdult) return 'anak-anak';
    let best = 'warga', bv = 0.42;
    const map = { tani: 'petani', ramu: 'peramu', kayu: 'penebang', pancing: 'pemancing', dagang: 'pedagang' };
    for (const k of Object.keys(map)) {
      if (this.skills[k] > bv) { bv = this.skills[k]; best = map[k]; }
    }
    return best;
  }

  // ====== Pembelajaran (reinforcement sederhana) ======
  qVal(actionId) { return this.q[actionId] ?? 1.0; }
  learn(actionId, reward) {
    // reward dinormalkan ~1.0 = sesuai harapan
    const old = this.qVal(actionId);
    this.q[actionId] = clamp(old + 0.18 * (reward - old), 0.25, 2.6);
  }

  // ====== Memori lokasi ======
  remember(x, y, kind, est, tick) {
    const near = this.spots.find(s => s.kind === kind && dist(s.x, s.y, x, y) < 1.2);
    if (near) { near.est = est; near.lastSeen = tick; return false; }
    this.spots.push({ x, y, kind, est, lastSeen: tick });
    if (this.spots.length > 48) {
      this.spots.sort((a, b) => b.est - a.est);
      this.spots.length = 48;
    }
    return true;
  }

  fearAt(x, y) {
    let f = 0;
    for (const d of this.dangers) f += d.mag * Math.exp(-dist(x, y, d.x, d.y) / 4.5);
    return f * (1.1 - this.traits.berani);
  }

  addDanger(x, y, mag) {
    const near = this.dangers.find(d => dist(d.x, d.y, x, y) < 3);
    if (near) near.mag = Math.min(3, near.mag + mag);
    else this.dangers.push({ x, y, mag });
  }

  decayDangers() {
    for (const d of this.dangers) d.mag *= 0.82;
    this.dangers = this.dangers.filter(d => d.mag > 0.06);
  }

  bestSpot(kind, world) {
    let best = null, bv = -Infinity;
    for (const s of this.spots) {
      if (s.kind !== kind || s.est <= 0.3) continue;
      const d = dist(this.x, this.y, s.x, s.y);
      const v = s.est / (1 + d * 0.12) - this.fearAt(s.x, s.y) * 2.2;
      if (v > bv) { bv = v; best = s; }
    }
    return bv > 0.1 ? best : null;
  }

  // ====== Relasi sosial ======
  opinionOf(id) {
    if (!this.opinions.has(id)) this.opinions.set(id, { aff: 0, meets: 0 });
    return this.opinions.get(id);
  }

  // ====== Kebutuhan per tick ======
  tickNeeds(world) {
    const n = this.needs;
    n.hunger -= this.asleep ? 0.03 : 0.06;
    n.social -= this.asleep ? 0.01 : (0.035 * (0.5 + this.traits.supel));
    if (this.asleep) {
      const atHome = this.home && dist(this.x, this.y, this.home.x, this.home.y) < 2;
      const big = atHome && world.at(this.home.x, this.home.y)?.level === 2;
      n.energy += big ? 0.72 : atHome ? 0.55 : 0.33;
    } else {
      n.energy -= 0.085;
    }
    for (const k of Object.keys(n)) n[k] = clamp(n[k], 0, 100);

    if (n.hunger <= 0) this.starveTicks++;
    else this.starveTicks = Math.max(0, this.starveTicks - 2);
  }

  eatFromInv() {
    if (this.inv.food <= 0) return false;
    this.inv.food--;
    this.needs.hunger = clamp(this.needs.hunger + 42, 0, 100);
    return true;
  }

  // ====== Gerak dengan pathfinding A* ======
  moveToward(tx, ty, world, speedMul = 1) {
    if (dist(this.x, this.y, tx, ty) < 0.6) return true;
    const key = Math.round(tx) * 1000 + Math.round(ty);

    // hitung ulang path kalau target berubah atau path basi
    if (!this.path || this.pathKey !== key || this.repath <= 0) {
      this.path = world.findPath(this.x, this.y, tx, ty);
      this.pathKey = key;
      this.pathIdx = 0;
      this.repath = 350;
      if (!this.path) { this.blockedTicks += 8; return false; }  // TAK TERJANGKAU
    }
    this.repath--;

    // ikuti waypoint
    let wp = this.path[this.pathIdx];
    while (wp && dist(this.x, this.y, wp[0], wp[1]) < 0.45) {
      this.pathIdx++;
      wp = this.path[this.pathIdx];
    }
    if (!wp) wp = [tx, ty];

    const sp = this.speed * speedMul * (this.isAdult ? 1 : 0.8) * (this.needs.energy < 12 ? 0.5 : 1) *
      world.speedAt(this.x, this.y, this.cart);
    const a = Math.atan2(wp[1] - this.y, wp[0] - this.x);
    const nx = this.x + Math.cos(a) * sp, ny = this.y + Math.sin(a) * sp;
    if (world.passable(nx, ny)) {
      this.x = nx; this.y = ny;
      this.blockedTicks = 0;
      world.tread(nx, ny);   // rumput terinjak → lama-lama jadi jalan setapak
    } else {
      this.blockedTicks++;
      if (this.blockedTicks > 6) this.repath = 0; // paksa hitung ulang
    }
    return dist(this.x, this.y, tx, ty) < 0.6;
  }

  logLife(day, text) {
    this.lifeEvents.push({ day, text });
    if (this.lifeEvents.length > 14) this.lifeEvents.shift();
  }
}
