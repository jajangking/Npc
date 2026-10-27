import { clamp, dist } from './rng.js';
import { T } from './world.js';

// ============================================================
// UTILITY AI — tiap aksi punya fungsi score() dan step().
// NPC menilai SEMUA aksi berdasarkan:
//   kebutuhan saat ini × sifat kepribadian × nilai-Q (pengalaman)
// lalu memilih yang paling menjanjikan. Tidak ada urutan script.
// ============================================================

const HUNGER_URGENCY = (npc) => {
  let u = Math.max(0, (75 - npc.needs.hunger)) * 0.05 + Math.max(0, 5 - npc.inv.food) * 0.45;
  if (npc.needs.hunger < 25 && npc.inv.food <= 1) u *= 2.5;   // KRISIS: cari makan di atas segalanya
  return u;
};
// pengali untuk pekerjaan non-pangan: kalau lapar & tak punya stok, tunda dulu
const WELL_FED = (npc) => (npc.needs.hunger < 30 && npc.inv.food <= 1) ? 0.15
  : (npc.needs.hunger < 50 && npc.inv.food <= 0) ? 0.45 : 1;

export const ACTIONS = {

  // ---------- MAKAN ----------
  makan: {
    emoji: '🍖',
    score(npc) {
      if (npc.inv.food <= 0 || npc.needs.hunger > 62) return 0;
      return 2.5 + (62 - npc.needs.hunger) * 0.12;
    },
    start(npc) { npc.thought = 'waktunya makan'; npc.action.t = 0; },
    step(npc, sim) {
      if (++npc.action.t > 14) {
        npc.eatFromInv();
        return { done: true, reward: 1.2 };
      }
      return null;
    },
  },

  // ---------- TIDUR ----------
  tidur: {
    emoji: '😴',
    score(npc, sim) {
      const e = npc.needs.energy;
      let s = e < 22 ? 5 + (22 - e) * 0.2 : 0;
      if (sim.world.isNight && e < 85) {
        s = Math.max(s, 2.2 + (85 - e) * 0.03);
        // trauma malam → makin takut makin ingin pulang
        s += npc.fearAt(npc.x, npc.y) * 0.8;
        if (!npc.isAdult) s += 2;
      }
      return s;
    },
    start(npc) {
      npc.thought = npc.home ? 'pulang untuk tidur' : 'mencari tempat rebahan';
      npc.action.phase = 'go';
    },
    step(npc, sim) {
      if (npc.action.phase === 'go') {
        const tgt = npc.home || { x: npc.x, y: npc.y };
        if (npc.moveToward(tgt.x, tgt.y, sim.world)) {
          npc.action.phase = 'sleep';
          npc.asleep = true;
          npc.thought = npc.home ? 'tidur nyenyak di rumah' : 'tidur beralaskan rumput';
        }
        return null;
      }
      if (npc.needs.energy >= 97 || (!sim.world.isNight && npc.needs.energy > 55)) {
        npc.asleep = false;
        return { done: true, reward: npc.home ? 1.3 : 0.8 };
      }
      return null;
    },
    onAbort(npc) { npc.asleep = false; },
  },

  // ---------- MERAMU BERI ----------
  ramu: {
    emoji: '🫐',
    score(npc, sim) {
      const spot = npc.bestSpot('bush', sim.world);
      if (!spot) return 0;
      return HUNGER_URGENCY(npc) * (0.55 + npc.skills.ramu) *
        npc.qVal('ramu') * (0.6 + npc.traits.rajin * 0.8) * sim.world.growthMod;
    },
    start(npc, sim) {
      npc.action.spot = npc.bestSpot('bush', sim.world);
      npc.action.t = 0;
      npc.thought = 'pergi memetik beri';
      if (!npc.action.spot) return false;
    },
    step(npc, sim) {
      const s = npc.action.spot;
      if (!s) return { done: true, reward: 0.3 };
      if (!npc.action.arrived) {
        if (npc.moveToward(s.x, s.y, sim.world)) npc.action.arrived = true;
        return null;
      }
      if (++npc.action.t < 40) { npc.thought = 'memetik beri...'; return null; }
      const tile = sim.world.at(s.x, s.y);
      if (!tile || tile.type !== T.BUSH || tile.berries <= 0) {
        // semaknya habis / hilang → update memori, pelajaran pahit
        s.est = 0;
        npc.thought = 'semaknya kosong... harus cari tempat lain';
        return { done: true, reward: 0.25 };
      }
      const got = Math.min(tile.berries, 2 + Math.round(npc.skills.ramu * 3 + npc.rng.rand()) + (npc.cart ? 1 : 0));
      tile.berries -= got;
      npc.inv.food += got;
      npc.skills.ramu = clamp(npc.skills.ramu + 0.01, 0, 1);
      sim.know.tani += 0.03;
      s.est = tile.berries; s.lastSeen = sim.world.tick;   // belajar: estimasi diperbarui dari kenyataan
      npc.thought = `dapat ${got} beri`;
      return { done: true, reward: 0.5 + got * 0.3 };
    },
  },

  // ---------- MEMANCING ----------
  pancing: {
    emoji: '🎣',
    score(npc, sim) {
      const spot = npc.bestSpot('fish', sim.world);
      if (!spot) return 0;
      const winter = sim.world.isWinter ? 0.55 : 1;
      return HUNGER_URGENCY(npc) * (0.4 + npc.skills.pancing * 1.2) *
        npc.qVal('pancing') * winter * (0.6 + npc.traits.rajin * 0.6);
    },
    start(npc, sim) {
      npc.action.spot = npc.bestSpot('fish', sim.world);
      npc.action.t = 0; npc.action.got = 0;
      npc.thought = 'menuju tepi air untuk memancing';
    },
    step(npc, sim) {
      const s = npc.action.spot;
      if (!s) return { done: true, reward: 0.3 };
      if (!npc.action.arrived) {
        if (npc.moveToward(s.x, s.y, sim.world)) npc.action.arrived = true;
        return null;
      }
      npc.thought = 'memancing dengan sabar...';
      npc.action.t++;
      const pCatch = (0.013 + npc.skills.pancing * 0.03) * (sim.world.isWinter ? 0.45 : 1);
      if (npc.rng.chance(pCatch)) {
        npc.action.got++;
        npc.inv.food++;
        npc.skills.pancing = clamp(npc.skills.pancing + 0.012, 0, 1);
      }
      if (npc.action.t > 160 || npc.action.got >= 3) {
        const g = npc.action.got;
        npc.thought = g > 0 ? `pulang bawa ${g} ikan` : 'ikannya tidak mau menggigit hari ini';
        s.est = clamp(s.est * 0.6 + g * 1.4, 0.2, 6);  // belajar seberapa bagus spot ini
        return { done: true, reward: 0.3 + g * 0.45 };
      }
      return null;
    },
  },

  // ---------- BERTANI ----------
  tani: {
    emoji: '🌾',
    score(npc, sim) {
      if (!npc.isAdult) return 0;
      if (npc.farm) {
        const f = npc.farm;
        if (f.planted && f.growth >= 100) return 4 + HUNGER_URGENCY(npc);   // PANEN!
        if (!f.planted && !sim.world.isWinter) return 1.4 * (0.5 + npc.traits.rajin) * npc.qVal('tani');
        return 0;
      }
      // belum punya ladang → buka ladang kalau tahu tanah subur
      if (sim.world.isWinter) return 0;
      const spot = npc.bestSpot('fertile', sim.world);
      if (!spot) return 0;
      return (0.5 + npc.skills.tani * 2) * (0.4 + npc.traits.rajin) * npc.qVal('tani') * 0.9;
    },
    start(npc, sim) {
      npc.action.t = 0;
      if (npc.farm) {
        npc.action.tx = npc.farm.fx; npc.action.ty = npc.farm.fy;
        npc.thought = npc.farm.growth >= 100 ? 'ladangku siap panen!' : 'mengurus ladang';
      } else {
        const s = npc.bestSpot('fertile', sim.world);
        if (!s) return false;
        npc.action.claim = s;
        npc.action.tx = s.x; npc.action.ty = s.y;
        npc.thought = 'membuka ladang baru';
      }
    },
    step(npc, sim) {
      if (!npc.action.arrived) {
        if (npc.moveToward(npc.action.tx, npc.action.ty, sim.world)) npc.action.arrived = true;
        return null;
      }
      if (++npc.action.t < 55) return null;

      if (!npc.farm) {
        const t = sim.world.at(npc.action.tx, npc.action.ty);
        if (!t || t.type !== T.FERTILE) { npc.action.claim.est = 0; return { done: true, reward: 0.3 }; }
        t.type = T.FARM; t.owner = npc.id; t.planted = false; t.growth = 0;
        t.fx = npc.action.tx; t.fy = npc.action.ty;
        npc.farm = t;
        sim.world.registerFarm(t);
        sim.log(`🌱 ${npc.name} membuka ladang baru`, 'econ');
        npc.logLife(sim.world.day, 'membuka ladang pertamanya');
        return { done: true, reward: 1.3 };
      }
      const f = npc.farm;
      if (f.planted && f.growth >= 100) {
        const yield_ = 6 + Math.round(npc.skills.tani * 8) + (npc.cart ? 1 : 0);
        npc.inv.food += yield_;
        f.planted = false; f.growth = 0;
        npc.skills.tani = clamp(npc.skills.tani + 0.03, 0, 1);
        sim.know.tani += 0.15 + npc.skills.tani * 0.3;
        npc.thought = `panen ${yield_} gandum!`;
        sim.log(`🌾 ${npc.name} memanen ${yield_} gandum`, 'econ');
        return { done: true, reward: 1 + yield_ * 0.18 };
      }
      if (!f.planted) {
        f.planted = true; f.growth = 0;
        npc.skills.tani = clamp(npc.skills.tani + 0.008, 0, 1);
        npc.thought = 'benih sudah ditanam';
        return { done: true, reward: 0.9 };
      }
      return { done: true, reward: 0.5 };
    },
  },

  // ---------- MENEBANG KAYU ----------
  kayu: {
    emoji: '🪓',
    score(npc, sim) {
      if (!npc.isAdult) return 0;
      const spot = npc.bestSpot('wood', sim.world);
      if (!spot) return 0;
      let need = 0;
      if (!npc.home && npc.inv.wood < 14) need = 2.8;                         // butuh rumah!
      else if (sim.techs.has('gerobak') && !npc.cart && npc.inv.wood < 8) need = 0.9;   // nabung buat gerobak
      else if (sim.techs.has('rumah_besar') && npc.home &&
               sim.world.at(npc.home.x, npc.home.y)?.level !== 2 && npc.inv.wood < 10) need = 0.8; // nabung renovasi
      else if (sim.market && sim.market.prices.wood > 2.4 && npc.inv.wood < 10) need = 0.9; // kayu lagi mahal
      else if (npc.inv.wood < 4) need = 0.45;
      return need * (0.5 + npc.skills.kayu) * npc.qVal('kayu') * (0.5 + npc.traits.rajin) * WELL_FED(npc);
    },
    start(npc, sim) {
      npc.action.spot = npc.bestSpot('wood', sim.world);
      npc.action.t = 0;
      npc.thought = 'pergi menebang kayu';
    },
    step(npc, sim) {
      const s = npc.action.spot;
      if (!s) return { done: true, reward: 0.3 };
      if (!npc.action.arrived) {
        if (npc.moveToward(s.x, s.y, sim.world)) npc.action.arrived = true;
        return null;
      }
      if (++npc.action.t < 70) { npc.thought = 'tok... tok... tok...'; return null; }
      const tile = sim.world.at(s.x, s.y);
      if (!tile || tile.type !== T.FOREST || tile.wood <= 0) {
        s.est = 0;
        npc.thought = 'pohon di sini sudah habis ditebang';
        return { done: true, reward: 0.25 };
      }
      const got = Math.min(tile.wood, 1 + Math.round(npc.skills.kayu * 2.5) + (npc.cart ? 1 : 0));
      tile.wood -= got;
      if (tile.wood <= 0) { tile.type = T.GRASS; delete tile.wood; }  // hutan bisa GUNDUL beneran
      npc.inv.wood += got;
      npc.skills.kayu = clamp(npc.skills.kayu + 0.012, 0, 1);
      sim.know.kayu += 0.2 + npc.skills.kayu * 0.25;
      s.est = tile.wood ?? 0;
      npc.thought = `dapat ${got} kayu`;
      return { done: true, reward: 0.5 + got * 0.3 };
    },
  },

  // ---------- MEMBANGUN RUMAH ----------
  bangun: {
    emoji: '🏠',
    score(npc) {
      if (!npc.isAdult || npc.home || npc.inv.wood < 14) return 0;
      return 6 * WELL_FED(npc);
    },
    start(npc, sim) {
      // cari lahan dekat pasar / dekat rumah orang tua
      const anchor = npc.parents?.[0]?.home || sim.world.market;
      const spot = sim.world.findNearest(anchor.x + npc.rng.int(-6, 6), anchor.y + npc.rng.int(-6, 6),
        (t, x, y) => t.type === T.GRASS && dist(x, y, sim.world.market.x, sim.world.market.y) > 2.5, 18);
      if (!spot) return false;
      npc.action.tx = spot.x; npc.action.ty = spot.y;
      npc.action.t = 0;
      npc.thought = 'membangun rumah sendiri!';
    },
    step(npc, sim) {
      if (!npc.action.arrived) {
        if (npc.moveToward(npc.action.tx, npc.action.ty, sim.world)) npc.action.arrived = true;
        return null;
      }
      if (++npc.action.t < 130) { npc.thought = 'memaku dan menyusun kayu...'; return null; }
      const t = sim.world.at(npc.action.tx, npc.action.ty);
      if (!t || t.type !== T.GRASS) return { done: true, reward: 0.3 };
      t.type = T.HOUSE; t.owner = npc.id;
      npc.inv.wood -= 14;
      npc.home = { x: npc.action.tx, y: npc.action.ty };
      sim.know.konstruksi += 4;
      sim.know.kayu += 1.5;
      if (npc.partner && !npc.partner.home) npc.partner.home = npc.home;
      sim.log(`🏠 ${npc.name} selesai membangun rumah`, 'econ');
      npc.logLife(sim.world.day, 'membangun rumah sendiri');
      return { done: true, reward: 2.2 };
    },
  },

  // ---------- BERSOSIALISASI ----------
  sosial: {
    emoji: '💬',
    score(npc, sim) {
      const other = sim.findChatPartner(npc);
      if (!other) return 0;
      return (100 - npc.needs.social) * 0.042 * (0.45 + npc.traits.supel) * npc.qVal('sosial');
    },
    start(npc, sim) {
      const other = sim.findChatPartner(npc);
      if (!other) return false;
      npc.action.other = other;
      npc.action.t = 0;
      npc.thought = `mencari ${other.name} untuk mengobrol`;
    },
    step(npc, sim) {
      const o = npc.action.other;
      if (!o || !o.alive) return { done: true, reward: 0.4 };
      if (dist(npc.x, npc.y, o.x, o.y) > 1.4) {
        npc.moveToward(o.x, o.y, sim.world);
        if (++npc.action.t > 220) return { done: true, reward: 0.35 }; // nyerah ngejar
        return null;
      }
      npc.action.chat = (npc.action.chat || 0) + 1;
      npc.thought = `mengobrol dengan ${o.name}`;
      if (npc.action.chat === 1) sim.conversation(npc, o);
      if (npc.action.chat > 45) {
        npc.needs.social = clamp(npc.needs.social + 30, 0, 100);
        o.needs.social = clamp(o.needs.social + 18, 0, 100);
        const aff = npc.opinionOf(o.id).aff;
        return { done: true, reward: 0.8 + Math.max(0, aff) * 0.012 };
      }
      return null;
    },
  },

  // ---------- BERDAGANG DI PASAR ----------
  dagang: {
    emoji: '💰',
    score(npc, sim) {
      if (!npc.isAdult) return 0;
      const m = sim.market;
      const sellFood = Math.max(0, npc.inv.food - 7);
      const sellWood = npc.home ? Math.max(0, npc.inv.wood - 4) : 0;
      const needFood = npc.inv.food < 2 && npc.inv.coins >= m.prices.food && m.stock.food > 0;
      let v = 0;
      if (sellFood > 2) v += sellFood * m.prices.food * 0.07;
      if (sellWood > 2) v += sellWood * m.prices.wood * 0.07;
      v *= (0.5 + npc.skills.dagang) * npc.qVal('dagang');
      // beli makan saat lapar itu kebutuhan, bukan soal bakat dagang
      if (needFood) v += 2.8 + Math.max(0, 45 - npc.needs.hunger) * 0.09;
      return v;
    },
    start(npc, sim) {
      npc.action.t = 0;
      npc.thought = 'pergi ke pasar';
    },
    step(npc, sim) {
      const m = sim.world.market;
      if (!npc.action.arrived) {
        if (npc.moveToward(m.x, m.y, sim.world)) npc.action.arrived = true;
        return null;
      }
      if (++npc.action.t < 30) { npc.thought = 'menawar di pasar...'; return null; }
      const r = sim.market.trade(npc, sim);
      return { done: true, reward: r };
    },
  },

  // ---------- MENDEKATI PUJAAN HATI ----------
  cinta: {
    emoji: '❤️',
    score(npc, sim) {
      if (!npc.isAdult || npc.isElder || npc.partner) return 0;
      const c = sim.findCourtTarget(npc);
      if (!c) return 0;
      return (npc.opinionOf(c.id).aff - 22) * 0.06 * (0.5 + npc.traits.supel);
    },
    start(npc, sim) {
      const c = sim.findCourtTarget(npc);
      if (!c) return false;
      npc.action.other = c;
      npc.action.t = 0;
      npc.thought = `hatinya berdebar memikirkan ${c.name}`;
    },
    step(npc, sim) {
      const o = npc.action.other;
      if (!o || !o.alive || o.partner) return { done: true, reward: 0.3 };
      if (dist(npc.x, npc.y, o.x, o.y) > 1.3) {
        npc.moveToward(o.x, o.y, sim.world);
        if (++npc.action.t > 240) return { done: true, reward: 0.3 };
        return null;
      }
      npc.action.chat = (npc.action.chat || 0) + 1;
      npc.thought = `merayu ${o.name}...`;
      if (npc.action.chat > 50) {
        const myAff = npc.opinionOf(o.id).aff;
        const theirAff = o.opinionOf(npc.id).aff;
        const p = 0.25 + npc.skills.pesona * 0.5 + (theirAff - 40) * 0.008;
        if (theirAff >= 32 && npc.rng.chance(clamp(p, 0.05, 0.9))) {
          sim.marry(npc, o);
          return { done: true, reward: 2.5 };
        }
        npc.skills.pesona = clamp(npc.skills.pesona + 0.02, 0, 1);
        npc.thought = `${o.name} belum luluh... mungkin lain kali`;
        npc.opinionOf(o.id).aff += 3;
        o.opinionOf(npc.id).aff += npc.rng.int(-2, 6);
        return { done: true, reward: 0.6 };
      }
      return null;
    },
  },

  // ---------- MENJELAJAH ----------
  jelajah: {
    emoji: '🧭',
    score(npc, sim) {
      const known = npc.spots.filter(s => s.est > 0.3).length;
      const foodKnown = npc.spots.filter(s => s.est > 0.3 && (s.kind === 'bush' || s.kind === 'fish')).length;
      let scarcity = known < 5 ? 1.6 : known < 10 ? 0.8 : 0.35;
      // tidak tahu satu pun sumber makanan → DESAKAN untuk menjelajah
      if (foodKnown === 0) scarcity = Math.max(scarcity, 1.2 + HUNGER_URGENCY(npc) * 0.5);
      return (0.5 + npc.traits.penasaran * 1.6) * scarcity * npc.qVal('jelajah') *
        (sim.world.isNight ? 0.25 : 1);
    },
    start(npc, sim) {
      // arah acak, agak jauh, hindari area trauma
      let bx = 0, by = 0, bs = -Infinity;
      for (let i = 0; i < 6; i++) {
        const x = npc.rng.int(2, 61), y = npc.rng.int(2, 43);
        const s = -npc.fearAt(x, y) + npc.rng.rand() * 0.5 + dist(npc.x, npc.y, x, y) * 0.02;
        if (s > bs && sim.world.passable(x, y)) { bs = s; bx = x; by = y; }
      }
      npc.action.tx = bx; npc.action.ty = by;
      npc.action.found = 0;
      npc.action.t = 0;
      npc.thought = 'menjelajahi daerah baru';
    },
    step(npc, sim) {
      npc.action.t++;
      // sambil jalan, amati sekeliling → ISI PETA MENTAL
      if (npc.action.t % 6 === 0) {
        const r = 2;
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
          const x = Math.round(npc.x) + dx, y = Math.round(npc.y) + dy;
          const t = sim.world.at(x, y);
          if (!t) continue;
          let added = false;
          if (t.type === T.BUSH && t.berries > 0) added = npc.remember(x, y, 'bush', t.berries, sim.world.tick);
          else if (t.type === T.FOREST && t.wood > 0) added = npc.remember(x, y, 'wood', t.wood, sim.world.tick);
          else if (t.type === T.FERTILE) added = npc.remember(x, y, 'fertile', 3, sim.world.tick);
          else if (t.type === T.WATER) {
            // spot mancing = daratan di pinggir air
            for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              if (sim.world.passable(x + ox, y + oy)) {
                added = npc.remember(x + ox, y + oy, 'fish', 2, sim.world.tick) || added;
                break;
              }
            }
          }
          if (added) npc.action.found++;
        }
      }
      const arrived = npc.moveToward(npc.action.tx, npc.action.ty, sim.world);
      if (arrived || npc.action.t > 320) {
        const f = npc.action.found;
        if (f > 0) npc.thought = `menemukan ${f} tempat baru!`;
        else npc.thought = 'tidak ada yang menarik di sana';
        return { done: true, reward: 0.4 + f * 0.25 };
      }
      return null;
    },
  },

  // ========== AKSI PEMBANGUNAN (terbuka lewat PENEMUAN teknologi) ==========

  // ---------- MELAPISI JALAN BATU (di atas jalur setapak yang ramai!) ----------
  bangunJalan: {
    emoji: '🛣️',
    score(npc, sim) {
      if (!sim.techs.has('jalan_batu') || !npc.isAdult) return 0;
      if (!sim.roadSite()) return 0;
      return 0.8 * (0.35 + npc.traits.rajin) * WELL_FED(npc) * npc.qVal('bangunJalan');
    },
    start(npc, sim) {
      const s = sim.roadSite();
      if (!s) return false;
      npc.action.tx = s.x; npc.action.ty = s.y;
      npc.action.t = 0;
      npc.thought = 'melapisi jalur ramai dengan batu';
    },
    step(npc, sim) {
      if (!npc.action.arrived) {
        if (npc.moveToward(npc.action.tx, npc.action.ty, sim.world)) npc.action.arrived = true;
        return null;
      }
      if (++npc.action.t < 90) { npc.thought = 'menyusun batu jalan...'; return null; }
      const t = sim.world.at(npc.action.tx, npc.action.ty);
      if (!t || t.type !== T.GRASS) return { done: true, reward: 0.4 };
      t.type = T.ROAD;
      sim.roadCount++;
      sim.know.konstruksi += 0.5;
      sim._roadCacheTick = 0;
      npc.skills.kayu = clamp(npc.skills.kayu + 0.006, 0, 1);
      if (sim.roadCount === 1) sim.log(`🛣️ ${npc.name} memasang jalan batu pertama desa!`, 'tech');
      else if (sim.roadCount % 15 === 0) sim.log(`🛣️ Jaringan jalan desa kini ${sim.roadCount} ruas`, 'econ');
      return { done: true, reward: 1.1 };
    },
  },

  // ---------- MEMBANGUN JEMBATAN ----------
  bangunJembatan: {
    emoji: '🌉',
    score(npc, sim) {
      if (!sim.techs.has('jembatan') || !npc.isAdult || npc.inv.wood < 4) return 0;
      if (!sim.bridgeSite()) return 0;
      return 1.1 * (0.35 + npc.traits.rajin) * WELL_FED(npc) * npc.qVal('bangunJembatan');
    },
    start(npc, sim) {
      const s = sim.bridgeSite();
      if (!s) return false;
      npc.action.site = s;
      npc.action.t = 0;
      npc.thought = 'hendak menjembatani air';
    },
    step(npc, sim) {
      const s = npc.action.site;
      const t = sim.world.at(s.x, s.y);
      if (!t || t.type !== T.WATER) return { done: true, reward: 0.4 }; // keburu dibangun orang
      if (dist(npc.x, npc.y, s.x, s.y) > 1.3) {
        npc.moveToward(s.x, s.y, sim.world);
        return null;
      }
      if (++npc.action.t < 200) { npc.thought = 'memancang tiang jembatan...'; return null; }
      t.type = T.BRIDGE;
      npc.inv.wood -= 4;
      sim.bridgeCount++;
      sim.know.konstruksi += 4;
      sim._bridgeCacheTick = 0;
      npc.skills.kayu = clamp(npc.skills.kayu + 0.02, 0, 1);
      sim.log(`🌉 ${npc.name} membangun jembatan di (${s.x}, ${s.y})!`, 'tech');
      npc.logLife(sim.world.day, 'membangun jembatan untuk desa');
      return { done: true, reward: 2.2 };
    },
  },

  // ---------- MEMBUAT GEROBAK PRIBADI ----------
  buatGerobak: {
    emoji: '🛞',
    score(npc, sim) {
      if (!sim.techs.has('gerobak') || !npc.isAdult || npc.cart || npc.inv.wood < 8) return 0;
      return 1.4 * (0.4 + npc.traits.rajin) * WELL_FED(npc);
    },
    start(npc) {
      npc.action.t = 0;
      npc.thought = 'merakit gerobak dorong';
    },
    step(npc, sim) {
      if (++npc.action.t < 150) { npc.thought = 'memasang roda gerobak...'; return null; }
      npc.inv.wood -= 8;
      npc.cart = true;
      sim.know.kayu += 2;
      sim.log(`🛞 ${npc.name} kini punya gerobak dorong`, 'econ');
      npc.logLife(sim.world.day, 'merakit gerobak pertamanya');
      return { done: true, reward: 1.8 };
    },
  },

  // ---------- MEMBANGUN LUMBUNG DESA ----------
  bangunLumbung: {
    emoji: '🛖',
    score(npc, sim) {
      if (!sim.techs.has('lumbung') || sim.granary || !npc.isAdult || npc.inv.wood < 10) return 0;
      return 1.8 * (0.4 + npc.traits.rajin) * WELL_FED(npc);
    },
    start(npc, sim) {
      const m = sim.world.market;
      const spot = sim.world.findNearest(m.x, m.y,
        (t, x, y) => t.type === T.GRASS && Math.abs(x - m.x) + Math.abs(y - m.y) > 2, 8);
      if (!spot) return false;
      npc.action.tx = spot.x; npc.action.ty = spot.y;
      npc.action.t = 0;
      npc.thought = 'membangun lumbung untuk desa';
    },
    step(npc, sim) {
      if (sim.granary) return { done: true, reward: 0.5 };
      if (!npc.action.arrived) {
        if (npc.moveToward(npc.action.tx, npc.action.ty, sim.world)) npc.action.arrived = true;
        return null;
      }
      if (++npc.action.t < 260) { npc.thought = 'menyusun rangka lumbung...'; return null; }
      const t = sim.world.at(npc.action.tx, npc.action.ty);
      if (!t || t.type !== T.GRASS) return { done: true, reward: 0.4 };
      t.type = T.GRANARY;
      npc.inv.wood -= 10;
      sim.granary = { x: npc.action.tx, y: npc.action.ty };
      sim.know.konstruksi += 6;
      sim.log(`🛖 ${npc.name} menyelesaikan LUMBUNG DESA — stok pangan kini awet!`, 'tech');
      npc.logLife(sim.world.day, 'membangun lumbung desa');
      return { done: true, reward: 2.5 };
    },
  },

  // ---------- MEMPERBESAR RUMAH ----------
  upgradeRumah: {
    emoji: '🏡',
    score(npc, sim) {
      if (!sim.techs.has('rumah_besar') || !npc.isAdult || !npc.home || npc.inv.wood < 10) return 0;
      const t = sim.world.at(npc.home.x, npc.home.y);
      if (!t || t.level === 2) return 0;
      return 1.2 * (0.4 + npc.traits.rajin) * WELL_FED(npc);
    },
    start(npc) {
      npc.action.t = 0;
      npc.thought = 'memperbesar rumah keluarga';
    },
    step(npc, sim) {
      if (dist(npc.x, npc.y, npc.home.x, npc.home.y) > 1.2) {
        npc.moveToward(npc.home.x, npc.home.y, sim.world);
        return null;
      }
      if (++npc.action.t < 220) { npc.thought = 'menambah lantai dua...'; return null; }
      const t = sim.world.at(npc.home.x, npc.home.y);
      if (!t || t.type !== T.HOUSE) return { done: true, reward: 0.4 };
      t.level = 2;
      npc.inv.wood -= 10;
      sim.know.konstruksi += 3;
      sim.log(`🏡 ${npc.name} memperbesar rumahnya jadi dua lantai`, 'econ');
      npc.logLife(sim.world.day, 'membangun rumah dua lantai');
      return { done: true, reward: 1.7 };
    },
  },

  // ---------- MEMASANG LAMPU JALAN ----------
  pasangLampu: {
    emoji: '🏮',
    score(npc, sim) {
      if (!sim.techs.has('lampu_jalan') || !npc.isAdult || npc.inv.wood < 1) return 0;
      if (!sim.lampSite(npc)) return 0;
      return 0.75 * (0.35 + npc.traits.rajin) * WELL_FED(npc);
    },
    start(npc, sim) {
      const s = sim.lampSite(npc);
      if (!s) return false;
      npc.action.tx = s.x; npc.action.ty = s.y;
      npc.action.t = 0;
      npc.thought = 'memasang lampu jalan';
    },
    step(npc, sim) {
      if (!npc.action.arrived) {
        if (npc.moveToward(npc.action.tx, npc.action.ty, sim.world)) npc.action.arrived = true;
        return null;
      }
      if (++npc.action.t < 70) { npc.thought = 'menegakkan tiang lampu...'; return null; }
      const t = sim.world.at(npc.action.tx, npc.action.ty);
      if (!t || t.type !== T.ROAD || t.lamp) return { done: true, reward: 0.4 };
      t.lamp = true;
      npc.inv.wood -= 1;
      sim.lamps.push({ x: npc.action.tx, y: npc.action.ty });
      sim.know.konstruksi += 0.8;
      if (sim.lamps.length === 1) sim.log(`🏮 ${npc.name} menyalakan lampu jalan pertama — malam tak segelap dulu`, 'tech');
      return { done: true, reward: 1.2 };
    },
  },

  // ---------- SANTAI ----------
  santai: {
    emoji: '🍃',
    score() { return 0.22; },
    start(npc, sim) {
      npc.action.tx = clamp(npc.x + npc.rng.range(-3, 3), 1, 62);
      npc.action.ty = clamp(npc.y + npc.rng.range(-3, 3), 1, 44);
      npc.action.t = 0;
      npc.thought = npc.rng.pick(['melamun menatap awan', 'jalan-jalan santai', 'bersenandung kecil', 'duduk di rerumputan']);
    },
    step(npc, sim) {
      npc.moveToward(npc.action.tx, npc.action.ty, sim.world, 0.5);
      if (++npc.action.t > 80) return { done: true, reward: 0.5 };
      return null;
    },
  },

  // ---------- KABUR DARI BAHAYA (refleks, bukan pilihan) ----------
  kabur: {
    emoji: '😱',
    score() { return 0; },  // tidak pernah dipilih lewat utility — di-trigger refleks
    start(npc, sim) {
      npc.asleep = false;
      npc.thought = 'LARI!!';
      npc.action.t = 0;
    },
    step(npc, sim) {
      const w = sim.nearestWolf(npc);
      npc.action.t++;
      if (!w || dist(npc.x, npc.y, w.x, w.y) > 9 || npc.action.t > 200) {
        npc.thought = 'fiuh... aman';
        return { done: true, reward: 0.5 };
      }
      // lari menjauhi serigala, condong ke arah rumah/pasar
      const anchor = npc.home || sim.world.market;
      const ax = npc.x + (npc.x - w.x) * 2 + (anchor.x - npc.x) * 0.3;
      const ay = npc.y + (npc.y - w.y) * 2 + (anchor.y - npc.y) * 0.3;
      npc.moveToward(ax, ay, sim.world, 1.6);
      return null;
    },
  },
};

// ====== Pemilihan aksi: utility + sedikit noise (softmax-ish) ======
export function chooseAction(npc, sim) {
  let bestId = 'santai', bestScore = -Infinity;
  for (const [id, a] of Object.entries(ACTIONS)) {
    let s = a.score(npc, sim);
    if (s <= 0) continue;
    s *= 0.88 + npc.rng.rand() * 0.24;   // noise → variasi perilaku antarindividu
    if (s > bestScore) { bestScore = s; bestId = id; }
  }
  return bestId;
}

export function startAction(npc, sim, id) {
  npc.action = { id };
  const a = ACTIONS[id];
  const ok = a.start(npc, sim);
  if (ok === false) { npc.action = { id: 'santai' }; ACTIONS.santai.start(npc, sim); }
}
