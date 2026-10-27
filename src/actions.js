import { clamp, dist } from './rng.js';
import { T } from './world.js';
import { MEME_POOL } from './social.js';

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
      const civicPending =
        (!sim.hall && sim.know.konstruksi >= 55 && sim.npcs.length >= 16) ||
        (!sim.school && sim.know.konstruksi >= 45 && sim.npcs.length >= 14 && sim.kidsCount() >= 3);
      if (!npc.home && npc.inv.wood < 14) need = 2.8;                         // butuh rumah!
      else if (civicPending && npc.traits.rajin > 0.45 && npc.inv.wood < 14) need = 0.9; // gotong royong proyek desa
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

  // ========== KEHIDUPAN KOTA: usaha, kuliner, hiburan ==========

  // ---------- MEMBUKA WARUNG (wirausaha!) ----------
  bukaWarung: {
    emoji: '🍜',
    score(npc, sim) {
      if (!npc.isAdult || npc.skills.dagang < 0.28 || npc.inv.coins < 16 || npc.inv.wood < 6) return 0;
      if (sim.know.dagang < 5 || sim.npcWarung(npc)) return 0;
      if (!sim.warungSite()) return 0;
      return 1.6 * (0.4 + npc.skills.dagang) * WELL_FED(npc);
    },
    start(npc, sim) {
      const s = sim.warungSite();
      if (!s) return false;
      npc.action.tx = s.x; npc.action.ty = s.y;
      npc.action.t = 0;
      npc.thought = 'bermimpi punya warung sendiri';
    },
    step(npc, sim) {
      if (!npc.action.arrived) {
        if (npc.moveToward(npc.action.tx, npc.action.ty, sim.world)) npc.action.arrived = true;
        return null;
      }
      if (++npc.action.t < 160) { npc.thought = 'mendirikan warung...'; return null; }
      const t = sim.world.at(npc.action.tx, npc.action.ty);
      if (!t || t.type !== T.GRASS) return { done: true, reward: 0.4 };
      t.type = T.WARUNG;
      t.owner = npc.id; t.stok = 0; t.kas = 0;
      t.bx = npc.action.tx; t.by = npc.action.ty;
      sim.warungs.push(t);
      npc.inv.coins -= 12; npc.inv.wood -= 6;
      sim.know.dagang += 2;
      sim.log(`🍜 ${npc.name} membuka warung makan!`, 'econ');
      npc.logLife(sim.world.day, 'membuka warung sendiri');
      return { done: true, reward: 2.2 };
    },
  },

  // ---------- MENJAGA & MENYETOK WARUNG ----------
  jagaWarung: {
    emoji: '🍲',
    score(npc, sim) {
      const w = sim.npcWarung(npc);
      if (!w) return 0;
      let v = 0;
      if (w.stok < 4 && npc.inv.food > 3) v = 1.4;        // perlu setok
      if (w.kas > 6) v = Math.max(v, 1.1);                // ambil hasil jualan
      return v * WELL_FED(npc);
    },
    start(npc, sim) {
      const w = sim.npcWarung(npc);
      if (!w) return false;
      npc.action.tx = w.bx; npc.action.ty = w.by;
      npc.action.t = 0;
      npc.thought = 'mengurus warung';
    },
    step(npc, sim) {
      if (!npc.action.arrived) {
        if (npc.moveToward(npc.action.tx, npc.action.ty, sim.world)) npc.action.arrived = true;
        return null;
      }
      if (++npc.action.t < 50) { npc.thought = 'memasak & menata dagangan...'; return null; }
      const w = sim.npcWarung(npc);
      if (!w) return { done: true, reward: 0.3 };
      const setor = Math.min(Math.max(0, npc.inv.food - 3), 8 - w.stok);
      if (setor > 0) { npc.inv.food -= setor; w.stok += setor; }
      let r = 0.7 + setor * 0.1;
      if (w.kas > 0) {
        npc.inv.coins += w.kas;
        npc.thought = `warung laku ${Math.round(w.kas * 10) / 10} koin!`;
        r += w.kas * 0.08;
        w.kas = 0;
        npc.skills.dagang = clamp(npc.skills.dagang + 0.01, 0, 1);
      }
      return { done: true, reward: r };
    },
  },

  // ---------- MAKAN DI WARUNG ----------
  makanWarung: {
    emoji: '🍛',
    score(npc, sim) {
      const w = sim.stockedWarung();
      if (!w || w.owner === npc.id) return 0;
      const harga = Math.round(sim.market.prices.food * 14) / 10;
      if (npc.inv.coins < harga || npc.needs.hunger > 58) return 0;
      let v = 1.6 + (58 - npc.needs.hunger) * 0.07 + Math.max(0, 50 - npc.needs.senang) * 0.02;
      if (npc.inv.food > 0) v *= 0.35;   // punya bekal sendiri → jajan cuma buat gaya
      return v * (1.15 - npc.traits.rajin * 0.4);
    },
    start(npc, sim) {
      const w = sim.stockedWarung();
      if (!w) return false;
      npc.action.w = w;
      npc.action.t = 0;
      npc.thought = 'perut lapar, jajan di warung ah';
    },
    step(npc, sim) {
      const w = npc.action.w;
      if (!w || w.type !== T.WARUNG) return { done: true, reward: 0.3 };
      if (!npc.action.arrived) {
        if (npc.moveToward(w.bx, w.by, sim.world)) npc.action.arrived = true;
        return null;
      }
      if (++npc.action.t < 35) { npc.thought = 'menyantap makanan warung...'; return null; }
      if (w.stok <= 0) { npc.thought = 'yah, warungnya kehabisan...'; return { done: true, reward: 0.3 }; }
      const harga = Math.round(sim.market.prices.food * 14) / 10;
      if (npc.inv.coins < harga) return { done: true, reward: 0.3 };
      npc.inv.coins -= harga;
      w.kas += harga; w.stok--;
      npc.needs.hunger = clamp(npc.needs.hunger + 45, 0, 100);
      npc.needs.senang = clamp(npc.needs.senang + 12, 0, 100);
      npc.needs.social = clamp(npc.needs.social + 8, 0, 100);
      npc.thought = 'kenyang & puas, masakannya enak';
      return { done: true, reward: 1.4 };
    },
  },

  // ---------- MEMBUKA KEDAI ----------
  bukaKedai: {
    emoji: '🍵',
    score(npc, sim) {
      if (!npc.isAdult || sim.kedai || npc.traits.supel < 0.5) return 0;
      if (npc.inv.coins < 18 || npc.inv.wood < 8 || sim.npcs.length < 12) return 0;
      return 1.5 * (0.4 + npc.traits.supel) * WELL_FED(npc);
    },
    start(npc, sim) {
      const s = sim.kedaiSite();
      if (!s) return false;
      npc.action.tx = s.x; npc.action.ty = s.y;
      npc.action.t = 0;
      npc.thought = 'desa ini butuh tempat nongkrong';
    },
    step(npc, sim) {
      if (sim.kedai) return { done: true, reward: 0.4 };
      if (!npc.action.arrived) {
        if (npc.moveToward(npc.action.tx, npc.action.ty, sim.world)) npc.action.arrived = true;
        return null;
      }
      if (++npc.action.t < 180) { npc.thought = 'membangun kedai...'; return null; }
      const t = sim.world.at(npc.action.tx, npc.action.ty);
      if (!t || t.type !== T.GRASS) return { done: true, reward: 0.4 };
      t.type = T.KEDAI;
      t.owner = npc.id; t.bx = npc.action.tx; t.by = npc.action.ty;
      sim.kedai = t;
      npc.inv.coins -= 10; npc.inv.wood -= 8;
      sim.log(`🍵 ${npc.name} membuka kedai teh — tempat nongkrong desa!`, 'econ');
      npc.logLife(sim.world.day, 'membuka kedai teh');
      return { done: true, reward: 2.2 };
    },
  },

  // ---------- NONGKRONG DI KEDAI ----------
  nongkrong: {
    emoji: '☕',
    score(npc, sim) {
      if (!sim.kedai || !npc.isAdult || npc.inv.coins < 1) return 0;
      const h = sim.world.hour;
      if (h < 16.5 || h > 22.5) return 0;
      return (70 - npc.needs.senang) * 0.045 * (0.45 + npc.traits.supel) * npc.qVal('nongkrong');
    },
    start(npc, sim) {
      npc.action.t = 0;
      npc.thought = 'sore-sore enaknya ngeteh di kedai';
    },
    step(npc, sim) {
      const k = sim.kedai;
      if (!k) return { done: true, reward: 0.3 };
      if (!npc.action.arrived) {
        if (npc.moveToward(k.bx, k.by, sim.world)) npc.action.arrived = true;
        return null;
      }
      npc.action.t++;
      npc.thought = 'ngobrol santai sambil ngeteh';
      // kedai = sarang gosip: ngobrol dengan sesama pengunjung
      if (npc.action.t % 35 === 0) {
        const others = sim.npcs.filter(o => o !== npc && o.alive &&
          dist(o.x, o.y, k.bx, k.by) < 2.2);
        if (others.length) sim.conversation(npc, others[Math.floor(npc.rng.rand() * others.length)]);
      }
      if (npc.action.t > 95) {
        npc.inv.coins -= 1;
        const owner = sim.npcs.find(o => o.id === k.owner);
        if (owner) owner.inv.coins += 1;
        npc.needs.senang = clamp(npc.needs.senang + 24, 0, 100);
        npc.needs.social = clamp(npc.needs.social + 20, 0, 100);
        return { done: true, reward: 1.3 };
      }
      return null;
    },
  },

  // ---------- MEMBANGUN TAMAN DESA ----------
  bangunTaman: {
    emoji: '🌳',
    score(npc, sim) {
      if (!npc.isAdult || sim.park || sim.know.konstruksi < 25 || sim.npcs.length < 12) return 0;
      if (npc.inv.wood < 4) return 0;
      return 1.2 * (0.4 + npc.traits.rajin) * WELL_FED(npc);
    },
    start(npc, sim) {
      const s = sim.parkSite();
      if (!s) return false;
      npc.action.tx = s.x; npc.action.ty = s.y;
      npc.action.t = 0;
      npc.thought = 'desa butuh taman yang asri';
    },
    step(npc, sim) {
      if (sim.park) return { done: true, reward: 0.4 };
      if (!npc.action.arrived) {
        if (npc.moveToward(npc.action.tx, npc.action.ty, sim.world)) npc.action.arrived = true;
        return null;
      }
      if (++npc.action.t < 170) { npc.thought = 'menanam bunga & menata taman...'; return null; }
      for (let dy = 0; dy <= 1; dy++) for (let dx = 0; dx <= 1; dx++) {
        const t = sim.world.at(npc.action.tx + dx, npc.action.ty + dy);
        if (t && t.type === T.GRASS) t.type = T.PARK;
      }
      npc.inv.wood -= 4;
      sim.park = { x: npc.action.tx, y: npc.action.ty };
      sim.know.konstruksi += 3;
      sim.log(`🌳 ${npc.name} membangun taman desa yang asri!`, 'tech');
      npc.logLife(sim.world.day, 'membangun taman desa');
      return { done: true, reward: 2 };
    },
  },

  // ---------- MEMBANGUN DERMAGA WISATA ----------
  bangunDermaga: {
    emoji: '🛥️',
    score(npc, sim) {
      if (!npc.isAdult || sim.pier || sim.know.kayu < 25 || npc.inv.wood < 6) return 0;
      if (!sim.pierSite()) return 0;
      return 1.1 * (0.4 + npc.traits.penasaran) * WELL_FED(npc);
    },
    start(npc, sim) {
      const s = sim.pierSite();
      if (!s) return false;
      npc.action.site = s;
      npc.action.t = 0;
      npc.thought = 'danau ini layak dinikmati dari dekat';
    },
    step(npc, sim) {
      if (sim.pier) return { done: true, reward: 0.4 };
      const s = npc.action.site;
      if (dist(npc.x, npc.y, s.x, s.y) > 1.3) {
        npc.moveToward(s.x, s.y, sim.world);
        return null;
      }
      if (++npc.action.t < 190) { npc.thought = 'memancang papan dermaga...'; return null; }
      const t = sim.world.at(s.x, s.y);
      if (!t || t.type !== T.WATER) return { done: true, reward: 0.4 };
      t.type = T.PIER;
      npc.inv.wood -= 6;
      sim.pier = { x: s.x, y: s.y };
      sim.know.kayu += 2;
      sim.log(`🛥️ ${npc.name} membangun dermaga wisata di danau!`, 'tech');
      npc.logLife(sim.world.day, 'membangun dermaga danau');
      return { done: true, reward: 2 };
    },
  },

  // ---------- PIKNIK / WISATA ----------
  piknik: {
    emoji: '🧺',
    score(npc, sim) {
      if (!sim.park && !sim.pier) return 0;
      if (sim.world.isNight) return 0;
      return (60 - npc.needs.senang) * 0.042 * (0.4 + npc.traits.penasaran * 0.6) * npc.qVal('piknik');
    },
    start(npc, sim) {
      // yang penasaran lebih suka dermaga (wisata), lainnya taman
      const prefPier = sim.pier && (!sim.park || npc.traits.penasaran > 0.5);
      npc.action.dest = prefPier ? sim.pier : sim.park;
      npc.action.isPier = prefPier;
      npc.action.t = 0;
      npc.thought = prefPier ? 'jalan-jalan ke dermaga danau' : 'piknik ke taman';
    },
    step(npc, sim) {
      const d = npc.action.dest;
      if (!d) return { done: true, reward: 0.3 };
      if (!npc.action.arrived) {
        if (npc.moveToward(d.x, d.y, sim.world)) npc.action.arrived = true;
        return null;
      }
      npc.action.t++;
      npc.thought = npc.action.isPier ? 'memandangi danau... tenangnya' : 'menikmati harum bunga taman';
      if (npc.action.t > 75) {
        npc.needs.senang = clamp(npc.needs.senang + (npc.action.isPier ? 28 : 20), 0, 100);
        return { done: true, reward: 1.2 };
      }
      return null;
    },
  },

  // ---------- ANAK-ANAK BERMAIN ----------
  main: {
    emoji: '⚽',
    score(npc, sim) {
      if (npc.isAdult || sim.world.isNight) return 0;
      return (80 - npc.needs.senang) * 0.055;
    },
    start(npc, sim) {
      const kids = sim.npcs.filter(o => o !== npc && !o.isAdult && o.alive &&
        dist(o.x, o.y, npc.x, npc.y) < 22);
      npc.action.friend = kids.length ? kids[Math.floor(npc.rng.rand() * kids.length)] : null;
      npc.action.t = 0;
      npc.thought = npc.action.friend ? `main kejar-kejaran dengan ${npc.action.friend.name}` : 'bermain sendirian';
    },
    step(npc, sim) {
      npc.action.t++;
      const f = npc.action.friend;
      if (f && f.alive) {
        // kejar-kejaran: lari ke arah teman + zig-zag
        const jx = f.x + npc.rng.range(-2, 2), jy = f.y + npc.rng.range(-2, 2);
        npc.moveToward(jx, jy, sim.world, 1.15);
        if (npc.action.t % 50 === 0) {
          f.needs.senang = clamp(f.needs.senang + 8, 0, 100);
          f.needs.social = clamp(f.needs.social + 6, 0, 100);
        }
      } else {
        const base = sim.park || npc.home || { x: npc.x, y: npc.y };
        npc.moveToward(base.x + npc.rng.range(-2.5, 2.5), base.y + npc.rng.range(-2.5, 2.5), sim.world);
      }
      if (npc.action.t > 130) {
        npc.needs.senang = clamp(npc.needs.senang + 28, 0, 100);
        npc.needs.social = clamp(npc.needs.social + 15, 0, 100);
        return { done: true, reward: 1.4 };
      }
      return null;
    },
  },

  // ---------- FESTIVAL DESA ----------
  festival: {
    emoji: '🎉',
    score(npc, sim) {
      return sim.festivalActive ? 5.5 : 0;
    },
    start(npc, sim) {
      const m = sim.world.market;
      npc.action.px = m.x + npc.rng.range(-2.5, 3);
      npc.action.py = m.y + npc.rng.range(-2.5, 3);
      npc.action.t = 0;
      npc.thought = 'festival! ayo ke alun-alun!';
    },
    step(npc, sim) {
      if (!sim.festivalActive) {
        npc.thought = 'festival yang menyenangkan...';
        return { done: true, reward: 1.8 };
      }
      npc.action.t++;
      const m = sim.world.market;
      if (!npc.action.arrived) {
        if (npc.moveToward(npc.action.px, npc.action.py, sim.world)) npc.action.arrived = true;
        return null;
      }
      // menari: bergoyang di tempat
      if (npc.action.t % 25 === 0) {
        npc.action.px = m.x + npc.rng.range(-2.5, 3);
        npc.action.py = m.y + npc.rng.range(-2.5, 3);
        npc.action.arrived = false;
      }
      npc.thought = npc.memes.has('tarian_senja') ? 'menari tarian senja!' : 'berpesta di festival!';
      npc.needs.senang = clamp(npc.needs.senang + 0.25, 0, 100);
      npc.needs.social = clamp(npc.needs.social + 0.18, 0, 100);
      // budaya & relasi menular deras saat pesta
      if (npc.action.t % 60 === 0) {
        const others = sim.npcs.filter(o => o !== npc && o.alive && dist(o.x, o.y, m.x, m.y) < 5);
        if (others.length) sim.conversation(npc, others[Math.floor(npc.rng.rand() * others.length)]);
      }
      return null;
    },
  },

  // ========== FASILITAS UMUM ==========

  // ---------- MEMBANGUN SEKOLAH ----------
  bangunSekolah: {
    emoji: '🏫',
    score(npc, sim) {
      if (!npc.isAdult || sim.school || npc.inv.wood < 12) return 0;
      if (sim.know.konstruksi < 45 || sim.npcs.length < 14 || sim.kidsCount() < 3) return 0;
      return 1.5 * (0.4 + npc.traits.rajin) * WELL_FED(npc);
    },
    start(npc, sim) {
      const s = sim.civicSite();
      if (!s) return false;
      npc.action.tx = s.x; npc.action.ty = s.y;
      npc.action.t = 0;
      npc.thought = 'anak-anak desa butuh sekolah';
    },
    step(npc, sim) {
      if (sim.school) return { done: true, reward: 0.4 };
      if (!npc.action.arrived) {
        if (npc.moveToward(npc.action.tx, npc.action.ty, sim.world)) npc.action.arrived = true;
        return null;
      }
      if (++npc.action.t < 240) { npc.thought = 'membangun ruang kelas...'; return null; }
      const t = sim.world.at(npc.action.tx, npc.action.ty);
      if (!t || t.type !== T.GRASS) return { done: true, reward: 0.4 };
      t.type = T.SCHOOL;
      npc.inv.wood -= 12;
      sim.school = { x: npc.action.tx, y: npc.action.ty };
      sim.know.konstruksi += 5;
      sim.log(`🏫 ${npc.name} membangun SEKOLAH DESA — ilmu kini diwariskan!`, 'tech');
      npc.logLife(sim.world.day, 'membangun sekolah desa');
      return { done: true, reward: 2.5 };
    },
  },

  // ---------- BERSEKOLAH (anak-anak) ----------
  belajar: {
    emoji: '📖',
    score(npc, sim) {
      if (npc.isAdult || npc.age < 4 || !sim.school) return 0;
      const h = sim.world.hour;
      if (h < 7.5 || h > 14) return 0;
      return 2.4 * npc.qVal('belajar');
    },
    start(npc, sim) {
      npc.action.t = 0;
      npc.thought = 'berangkat sekolah';
    },
    step(npc, sim) {
      const s = sim.school;
      if (!s) return { done: true, reward: 0.3 };
      if (!npc.action.arrived) {
        if (npc.moveToward(s.x, s.y, sim.world)) npc.action.arrived = true;
        return null;
      }
      npc.action.t++;
      npc.thought = 'belajar membaca & berhitung';
      if (npc.action.t > 140) {
        // pendidikan: semua keahlian tumbuh + ilmu desa terjaga
        for (const k of Object.keys(npc.skills)) {
          npc.skills[k] = clamp(npc.skills[k] + 0.006, 0, 1);
        }
        sim.know.tani += 0.03; sim.know.kayu += 0.03;
        sim.know.konstruksi += 0.03; sim.know.dagang += 0.03;
        npc.needs.senang = clamp(npc.needs.senang + 10, 0, 100);
        npc.needs.social = clamp(npc.needs.social + 14, 0, 100);
        return { done: true, reward: 1.4 };
      }
      return null;
    },
  },

  // ---------- MEMBANGUN BALAI DESA ----------
  bangunBalai: {
    emoji: '🏛️',
    score(npc, sim) {
      if (!npc.isAdult || sim.hall || npc.inv.wood < 14) return 0;
      if (sim.know.konstruksi < 55 || sim.npcs.length < 16) return 0;
      return 1.5 * (0.4 + npc.traits.rajin) * WELL_FED(npc);
    },
    start(npc, sim) {
      const s = sim.civicSite();
      if (!s) return false;
      npc.action.tx = s.x; npc.action.ty = s.y;
      npc.action.t = 0;
      npc.thought = 'desa sebesar ini butuh pemimpin & balai';
    },
    step(npc, sim) {
      if (sim.hall) return { done: true, reward: 0.4 };
      if (!npc.action.arrived) {
        if (npc.moveToward(npc.action.tx, npc.action.ty, sim.world)) npc.action.arrived = true;
        return null;
      }
      if (++npc.action.t < 260) { npc.thought = 'membangun balai desa...'; return null; }
      const t = sim.world.at(npc.action.tx, npc.action.ty);
      if (!t || t.type !== T.GRASS) return { done: true, reward: 0.4 };
      t.type = T.HALL;
      npc.inv.wood -= 14;
      sim.hall = { x: npc.action.tx, y: npc.action.ty };
      sim.know.konstruksi += 6;
      sim.log(`🏛️ ${npc.name} menyelesaikan BALAI DESA — musyawarah pemilihan dimulai!`, 'tech');
      npc.logLife(sim.world.day, 'membangun balai desa');
      sim.election();
      return { done: true, reward: 2.5 };
    },
  },

  // ---------- MEMBANGUN PENDOPO BUDAYA ----------
  bangunPendopo: {
    emoji: '🏯',
    score(npc, sim) {
      if (!npc.isAdult || sim.pendopo || npc.inv.wood < 10 || sim.npcs.length < 14) return 0;
      const d = sim.dominantMeme();
      if (!d.meme || d.count < sim.npcs.length * 0.6) return 0;
      if (!npc.memes.has(d.meme)) return 0;   // hanya penganutnya yang terdorong
      return 1.4 * (0.4 + npc.traits.supel) * WELL_FED(npc);
    },
    start(npc, sim) {
      const s = sim.civicSite();
      if (!s) return false;
      npc.action.tx = s.x; npc.action.ty = s.y;
      npc.action.t = 0;
      npc.thought = 'budaya kita layak diabadikan';
    },
    step(npc, sim) {
      if (sim.pendopo) return { done: true, reward: 0.4 };
      if (!npc.action.arrived) {
        if (npc.moveToward(npc.action.tx, npc.action.ty, sim.world)) npc.action.arrived = true;
        return null;
      }
      if (++npc.action.t < 230) { npc.thought = 'mengukir tiang pendopo...'; return null; }
      const t = sim.world.at(npc.action.tx, npc.action.ty);
      if (!t || t.type !== T.GRASS) return { done: true, reward: 0.4 };
      const d = sim.dominantMeme();
      t.type = T.PENDOPO;
      npc.inv.wood -= 10;
      sim.pendopo = { x: npc.action.tx, y: npc.action.ty };
      sim.pendopoMeme = d.meme;
      const def = MEME_POOL.find(m => m.id === d.meme);
      sim.log(`🏯 ${npc.name} membangun PENDOPO untuk mengabadikan "${def ? def.name : d.meme}"!`, 'culture');
      npc.logLife(sim.world.day, 'membangun pendopo budaya');
      return { done: true, reward: 2.5 };
    },
  },

  // ---------- BERKUNJUNG KE PENDOPO ----------
  kePendopo: {
    emoji: '🙏',
    score(npc, sim) {
      if (!sim.pendopo || sim.world.isNight) return 0;
      return (55 - npc.needs.senang) * 0.035 * (0.4 + npc.traits.supel * 0.5);
    },
    start(npc, sim) {
      npc.action.t = 0;
      npc.thought = 'berkunjung ke pendopo';
    },
    step(npc, sim) {
      const p = sim.pendopo;
      if (!p) return { done: true, reward: 0.3 };
      if (!npc.action.arrived) {
        if (npc.moveToward(p.x, p.y, sim.world)) npc.action.arrived = true;
        return null;
      }
      npc.action.t++;
      npc.thought = 'merenung di bawah atap pendopo';
      if (npc.action.t > 60) {
        npc.needs.senang = clamp(npc.needs.senang + 18, 0, 100);
        // tradisi yang diabadikan menular pada pengunjung
        if (sim.pendopoMeme && !npc.memes.has(sim.pendopoMeme) && npc.rng.chance(0.35)) {
          npc.memes.add(sim.pendopoMeme);
        }
        return { done: true, reward: 1.1 };
      }
      return null;
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
