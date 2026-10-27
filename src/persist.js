// ============================================================
// PERSISTENSI — simpan & muat seluruh keadaan simulasi ke JSON.
// Dipakai server headless untuk autosave, supaya desa tetap
// hidup melewati restart.
// ============================================================
import { Sim } from './sim.js';
import { World, W, H, T } from './world.js';
import { NPC, setNextId } from './npc.js';
import { Market } from './economy.js';
import { makeRng } from './rng.js';
import { makeNameGen } from './names.js';

const SAVE_VERSION = 1;

// ---------- MIGRASI ----------
// Kalau struktur save berubah di masa depan: naikkan SAVE_VERSION,
// lalu tambahkan fungsi migrasi dari versi lama ke baru di sini.
// Contoh:  1: (d) => { d.fiturBaru = nilaiDefault; d.v = 2; return d; }
// Dengan begitu save desa lama TETAP bisa dimuat, tidak pernah reset.
export const MIGRATIONS = {};

export function migrate(data) {
  if (!data || typeof data.v !== 'number') throw new Error('save tidak valid');
  while (data.v < SAVE_VERSION) {
    const step = MIGRATIONS[data.v];
    if (!step) throw new Error(`tidak ada jalur migrasi dari v${data.v}`);
    const from = data.v;
    data = step(data);
    if (data.v <= from) throw new Error(`migrasi v${from} tidak menaikkan versi`);
  }
  return data;
}

// ---------- SIMPAN ----------
export function serializeSim(sim) {
  const npcData = sim.npcs.map(n => ({
    id: n.id, sex: n.sex, firstName: n.firstName, surname: n.surname, name: n.name,
    age: n.age, alive: n.alive, x: n.x, y: n.y, speed: n.speed,
    needs: n.needs, starveTicks: n.starveTicks, asleep: n.asleep,
    traits: n.traits, skills: n.skills, inv: n.inv,
    spots: n.spots, dangers: n.dangers, lifeEvents: n.lifeEvents.slice(-20),
    opinions: [...n.opinions.entries()],
    memes: [...n.memes], q: n.q, cart: n.cart,
    partner: n.partner ? n.partner.id : null,
    parents: n.parents ? n.parents.map(p => p ? p.id : null) : null,
    children: n.children.map(c => c.id),
    home: n.home, farm: n.farm ? { fx: n.farm.fx, fy: n.farm.fy } : null,
    thought: n.thought,
  }));

  return {
    v: SAVE_VERSION,
    savedAt: Date.now(),
    seed: sim.seed,
    rngState: sim.rng.getState(),
    world: {
      tick: sim.world.tick,
      tiles: sim.world.tiles,
      traffic: Array.from(sim.world.traffic),
      market: sim.world.market,
    },
    economy: {
      prices: sim.market.prices, flow: sim.market.flow,
      stock: sim.market.stock, history: {
        food: sim.market.history.food.slice(-60),
        wood: sim.market.history.wood.slice(-60),
      },
    },
    npcs: npcData,
    wolves: sim.wolves.map(w => ({ x: w.x, y: w.y, cooldown: w.cooldown || 0 })),
    logs: sim.logs,
    stats: sim.stats,
    lastDay: sim.lastDay,
    know: sim.know,
    techs: [...sim.techs],
    granary: sim.granary, lamps: sim.lamps,
    roadCount: sim.roadCount, bridgeCount: sim.bridgeCount,
    warungs: sim.warungs.map(t => ({ bx: t.bx, by: t.by })),
    kedai: sim.kedai ? { bx: sim.kedai.bx, by: sim.kedai.by } : null,
    park: sim.park, pier: sim.pier,
    school: sim.school, hall: sim.hall, pendopo: sim.pendopo,
    pendopoMeme: sim.pendopoMeme, leader: sim.leader,
    festivalToday: sim.festivalToday, festivalActive: sim.festivalActive,
  };
}

// ---------- MUAT ----------
export function restoreSim(data) {
  data = migrate(data);
  if (data.v !== SAVE_VERSION) throw new Error('versi save tidak cocok');

  const sim = Object.create(Sim.prototype);
  sim.seed = data.seed;
  sim.rng = makeRng(data.seed);
  sim.rng.setState(data.rngState);
  sim.nameGen = makeNameGen(sim.rng);

  // --- dunia ---
  const world = Object.create(World.prototype);
  world.rng = sim.rng;
  world.tick = data.world.tick;
  world.tiles = data.world.tiles;
  world.traffic = Float32Array.from(data.world.traffic);
  world.market = data.world.market;
  world.bushList = null; // dibangun ulang lazily di step()
  world.forestList = null;
  world.farmList = world.tiles.filter(t => t.type === T.FARM);
  sim.world = world;

  // --- ekonomi ---
  const market = new Market();
  Object.assign(market.prices, data.economy.prices);
  Object.assign(market.flow, data.economy.flow);
  Object.assign(market.stock, data.economy.stock);
  market.history = data.economy.history;
  sim.market = market;

  // --- NPC ---
  let maxId = 0;
  sim.npcs = data.npcs.map(d => {
    const n = Object.create(NPC.prototype);
    n.id = d.id; maxId = Math.max(maxId, d.id);
    n.rng = sim.rng;
    n.sex = d.sex; n.firstName = d.firstName; n.surname = d.surname; n.name = d.name;
    n.age = d.age; n.alive = d.alive;
    n.x = d.x; n.y = d.y; n.speed = d.speed;
    n.needs = d.needs; n.starveTicks = d.starveTicks; n.asleep = d.asleep;
    n.traits = d.traits; n.skills = d.skills; n.inv = d.inv;
    n.spots = d.spots; n.dangers = d.dangers; n.lifeEvents = d.lifeEvents;
    n.opinions = new Map(d.opinions);
    n.memes = new Set(d.memes);
    n.q = d.q; n.cart = d.cart;
    n.home = d.home;
    n.thought = d.thought || 'kembali dari lelap';
    n.children = []; n.partner = null; n.parents = null;
    n.farm = null;
    n.action = null; n.path = null; n.pathIdx = 0;
    n.blockedTicks = 0; n.fleeTarget = null;
    sim.nameGen.reserve(n.firstName);
    return n;
  });
  setNextId(maxId + 1);

  // sambungkan ulang referensi antar-NPC & ke tile
  const byId = new Map(sim.npcs.map(n => [n.id, n]));
  data.npcs.forEach((d, i) => {
    const n = sim.npcs[i];
    if (d.partner != null) n.partner = byId.get(d.partner) || null;
    if (d.parents) n.parents = d.parents.map(id => (id != null ? byId.get(id) : null) || null);
    n.children = d.children.map(id => byId.get(id)).filter(Boolean);
    if (d.farm) {
      const t = world.at(d.farm.fx, d.farm.fy);
      if (t && t.type === T.FARM) n.farm = t;
    }
  });

  // --- keadaan desa ---
  sim.wolves = data.wolves;
  sim.logs = data.logs;
  sim.stats = data.stats;
  sim.lastDay = data.lastDay;
  sim.know = data.know;
  sim.techs = new Set(data.techs);
  sim.granary = data.granary;
  sim.lamps = data.lamps;
  sim.roadCount = data.roadCount;
  sim.bridgeCount = data.bridgeCount;
  sim.warungs = data.warungs
    .map(c => world.at(c.bx, c.by))
    .filter(t => t && t.type === T.WARUNG);
  sim.kedai = data.kedai ? world.at(data.kedai.bx, data.kedai.by) : null;
  sim.park = data.park; sim.pier = data.pier;
  sim.school = data.school; sim.hall = data.hall; sim.pendopo = data.pendopo;
  sim.pendopoMeme = data.pendopoMeme; sim.leader = data.leader;
  sim.festivalToday = data.festivalToday;
  sim.festivalActive = data.festivalActive;

  return sim;
}
