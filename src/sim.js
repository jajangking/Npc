import { makeRng, clamp, dist } from './rng.js';
import { makeNameGen } from './names.js';
import { World, T, DAY } from './world.js';
import { NPC, resetIds } from './npc.js';
import { ACTIONS, chooseAction, startAction } from './actions.js';
import { Market } from './economy.js';
import { conversation, maybeInventMeme, MEME_POOL } from './social.js';

// ============================================================
// SIM — menjalankan dunia. Tugasnya hanya memutar roda waktu;
// semua drama (cinta, paceklik, trauma, tradisi) muncul sendiri.
// ============================================================
export class Sim {
  constructor(seed) {
    this.seed = seed;
    this.rng = makeRng(seed);
    this.nameGen = makeNameGen(this.rng);
    resetIds();
    this.world = new World(this.rng);
    this.market = new Market();
    this.npcs = [];
    this.wolves = [];
    this.logs = [];
    this.stats = { births: 0, deaths: 0, weddings: 0 };
    this.lastDay = 0;

    // Penduduk awal
    const m = this.world.market;
    for (let i = 0; i < 14; i++) {
      const npc = new NPC(this.rng, this.nameGen, {
        x: m.x + this.rng.range(-4, 4),
        y: m.y + this.rng.range(-4, 4),
      });
      // tiap orang kenal sedikit area sekitar — sisanya harus DICARI sendiri
      npc.inv.food = 7;
      this.seedKnowledge(npc, 5);
      this.npcs.push(npc);
    }
    // supaya saling kenal dikit di awal
    for (const a of this.npcs) for (const b of this.npcs) {
      if (a !== b && this.rng.chance(0.4)) a.opinionOf(b.id).aff = this.rng.int(-5, 20);
    }
    this.log(`🌍 Desa baru berdiri dengan ${this.npcs.length} perintis`, 'info');
  }

  seedKnowledge(npc, count) {
    // minimal 2 sumber makanan — sisanya acak
    let bushes = 0;
    for (let tries = 0; tries < 600 && bushes < 2; tries++) {
      const x = this.rng.int(0, 63), y = this.rng.int(0, 45);
      const t = this.world.at(x, y);
      if (t && t.type === T.BUSH && t.berries > 0) { npc.remember(x, y, 'bush', t.berries, 0); bushes++; }
    }
    // satu spot mancing di pinggir air
    const ws = this.world.findNearest(npc.x, npc.y, (t) => t.type === T.WATER, 60);
    if (ws) {
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (this.world.passable(ws.x + ox, ws.y + oy)) { npc.remember(ws.x + ox, ws.y + oy, 'fish', 2, 0); break; }
      }
    }
    let found = 0;
    for (let tries = 0; tries < 300 && found < count; tries++) {
      const x = this.rng.int(0, 63), y = this.rng.int(0, 45);
      const t = this.world.at(x, y);
      if (!t) continue;
      if (t.type === T.BUSH && t.berries > 0) { npc.remember(x, y, 'bush', t.berries, 0); found++; }
      else if (t.type === T.FOREST && t.wood > 0 && this.rng.chance(0.4)) { npc.remember(x, y, 'wood', t.wood, 0); found++; }
      else if (t.type === T.FERTILE && this.rng.chance(0.3)) { npc.remember(x, y, 'fertile', 3, 0); found++; }
    }
  }

  log(msg, type = 'info') {
    this.logs.push({ day: this.world.day, msg, type });
    if (this.logs.length > 140) this.logs.shift();
  }

  countMeme(id) { return this.npcs.filter(n => n.memes.has(id)).length; }
  anyoneHasMeme(id) { return this.npcs.some(n => n.memes.has(id)); }

  // ====== Helper pencarian sosial ======
  isSibling(a, b) {
    return !!(a.parents && b.parents &&
      (a.parents[0] === b.parents[0] || a.parents[1] === b.parents[1]));
  }

  findChatPartner(npc) {
    // kadang menyapa orang BARU (apalagi yang penasaran), kadang teman lama —
    // tanpa ini, pertemanan jadi klik tertutup dan desa mandek
    const explore = this.rng.chance(0.25 + npc.traits.penasaran * 0.25);
    let best = null, bv = -Infinity;
    for (const o of this.npcs) {
      if (o === npc || !o.alive || o.asleep) continue;
      const d = dist(npc.x, npc.y, o.x, o.y);
      if (d > 26) continue;
      const aff = npc.opinionOf(o.id).aff;
      let v = explore
        ? this.rng.rand() * 2 - d * 0.05 - Math.abs(aff) * 0.01
        : aff * 0.05 - d * 0.1 + this.rng.rand();
      // lajang dewasa tertarik mengenal lajang lawan jenis
      if (!npc.partner && !o.partner && npc.isAdult && o.isAdult && !npc.isElder && !o.isElder &&
          o.sex !== npc.sex && !this.isSibling(npc, o)) v += 0.9;
      if (v > bv) { bv = v; best = o; }
    }
    return best;
  }

  findCourtTarget(npc) {
    let best = null, bv = 28;
    for (const o of this.npcs) {
      if (o === npc || !o.alive || o.partner || !o.isAdult || o.isElder) continue;
      if (o.sex === npc.sex) continue;
      if (this.isSibling(npc, o)) continue; // bukan saudara
      const aff = npc.opinionOf(o.id).aff;
      if (aff > bv) { bv = aff; best = o; }
    }
    return best;
  }

  marry(a, b) {
    a.partner = b; b.partner = a;
    const home = a.home || b.home;
    if (home) { a.home = home; b.home = home; }
    b.surname = a.surname;
    this.stats.weddings++;
    this.log(`💞 ${a.name} & ${b.name} menjadi pasangan!`, 'love');
    a.logLife(this.world.day, `menikah dengan ${b.name}`);
    b.logLife(this.world.day, `menikah dengan ${a.name}`);
    a.opinionOf(b.id).aff = 90; b.opinionOf(a.id).aff = 90;
  }

  conversation(a, b) { conversation(a, b, this); }

  nearestWolf(npc) {
    let best = null, bd = Infinity;
    for (const w of this.wolves) {
      const d = dist(npc.x, npc.y, w.x, w.y);
      if (d < bd) { bd = d; best = w; }
    }
    return best;
  }

  // ====== TICK UTAMA ======
  step() {
    this.world.step();
    const isNewDay = this.world.day !== this.lastDay;
    if (isNewDay) { this.lastDay = this.world.day; this.dailyUpdate(); }

    for (const npc of this.npcs) {
      if (!npc.alive) continue;
      npc.tickNeeds(this.world);

      // Refleks: serigala dekat → kabur, apapun yang sedang dilakukan
      if (npc.action?.id !== 'kabur') {
        const w = this.nearestWolf(npc);
        if (w && dist(npc.x, npc.y, w.x, w.y) < 6) {
          if (npc.action?.id && ACTIONS[npc.action.id].onAbort) ACTIONS[npc.action.id].onAbort(npc);
          startAction(npc, this, 'kabur');
          npc.addDanger(w.x, w.y, 1.2);
        }
      }

      // Jalankan aksi
      if (!npc.action) {
        startAction(npc, this, chooseAction(npc, this));
      } else {
        const a = ACTIONS[npc.action.id];
        npc.action.age = (npc.action.age || 0) + 1;
        const res = a.step(npc, this);
        if (res && res.done) {
          npc.learn(npc.action.id, res.reward);   // <-- NPC BELAJAR dari hasil nyata
          npc.action = null;
        } else if (npc.action && (npc.action.age > 650 || npc.blockedTicks > 60) && npc.action.id !== 'tidur') {
          // macet / target tak terjangkau → menyerah & BELAJAR kalau itu buang waktu
          if (npc.action.spot) npc.action.spot.est *= 0.3;  // tempat itu susah dijangkau
          if (a.onAbort) a.onAbort(npc);
          npc.learn(npc.action.id, 0.3);
          npc.thought = 'menyerah... jalannya tidak ketemu';
          npc.action = null;
          npc.blockedTicks = 0;
          npc.path = null;
        }
      }

      // Interupsi: kebutuhan kritis membatalkan pekerjaan yang kurang penting
      if (npc.action && this.world.tick % 50 === npc.id % 50) {
        const cur = npc.action.id;
        const FOOD_ACTIONS = ['makan', 'ramu', 'pancing', 'dagang', 'kabur', 'tani'];
        const crisis = npc.needs.hunger < 35 && !FOOD_ACTIONS.includes(cur);
        if (cur === 'santai' || cur === 'jelajah' || crisis) {
          const better = chooseAction(npc, this);
          if (better !== cur && better !== 'santai') {
            if (ACTIONS[cur].onAbort) ACTIONS[cur].onAbort(npc);
            startAction(npc, this, better);
          }
        }
      }

      // Kreativitas budaya
      if (this.world.tick % 90 === npc.id % 90) maybeInventMeme(npc, this);

      // Kematian kelaparan
      if (npc.starveTicks > DAY * 1.5) this.kill(npc, 'kelaparan 💀');
    }

    this.updateWolves();
    this.feedChildren();
    this.mutualAid();
  }

  // Gotong royong: pasangan & teman dekat menolong yang kelaparan.
  // Relasi sosial jadi jaring pengaman — makanya bersosialisasi itu "investasi".
  mutualAid() {
    if (this.world.tick % 60 !== 0) return;
    for (const hungry of this.npcs) {
      if (!hungry.alive || hungry.inv.food > 0 || hungry.needs.hunger > 32) continue;
      let giver = null;
      // pasangan selalu menolong
      if (hungry.partner?.alive && hungry.partner.inv.food > 2) giver = hungry.partner;
      else {
        for (const o of this.npcs) {
          if (o === hungry || !o.alive || o.inv.food <= 4) continue;
          if (dist(o.x, o.y, hungry.x, hungry.y) > 12) continue;
          if (o.opinionOf(hungry.id).aff > 25) { giver = o; break; }
        }
      }
      if (giver) {
        const amount = Math.min(2, giver.inv.food - 2);
        if (amount <= 0) continue;
        giver.inv.food -= amount;
        hungry.inv.food += amount;
        giver.thought = `membagi makanan untuk ${hungry.name}`;
        hungry.thought = `ditolong ${giver.name}... tidak akan kulupakan`;
        hungry.opinionOf(giver.id).aff = clamp(hungry.opinionOf(giver.id).aff + 15, -100, 100);
        giver.opinionOf(hungry.id).aff = clamp(giver.opinionOf(hungry.id).aff + 4, -100, 100);
      }
    }
  }

  feedChildren() {
    if (this.world.tick % 40 !== 0) return;
    for (const c of this.npcs) {
      if (c.isAdult || !c.alive) continue;
      if (c.needs.hunger < 45 && c.inv.food <= 0) {
        const parent = (c.parents || []).find(p => p && p.alive && p.inv.food > 1);
        if (parent && dist(c.x, c.y, parent.x, parent.y) < 14) {
          parent.inv.food--;
          c.inv.food++;
          parent.thought = `memberi makan ${c.name}`;
        }
      }
    }
  }

  // ====== SERIGALA ======
  updateWolves() {
    const w = this.world;
    // muncul malam hari, dari pinggir hutan
    if (w.isNight && this.wolves.length < 2 && this.rng.chance(0.0012 * (w.isWinter ? 2.2 : 1))) {
      const spot = w.findNearest(this.rng.int(0, 63), this.rng.int(0, 45), t => t.type === T.FOREST, 60);
      if (spot) {
        this.wolves.push({ x: spot.x, y: spot.y, cooldown: 0 });
        this.log('🐺 Lolongan serigala terdengar di kegelapan...', 'danger');
      }
    }
    if (!w.isNight && this.wolves.length) {
      this.wolves = [];
    }
    for (const wolf of this.wolves) {
      wolf.cooldown = Math.max(0, wolf.cooldown - 1);
      // cari mangsa terdekat yang di luar rumah
      let prey = null, bd = 14;
      let bravesNear = 0;
      for (const n of this.npcs) {
        if (!n.alive) continue;
        const d = dist(n.x, n.y, wolf.x, wolf.y);
        if (d < 4 && n.traits.berani > 0.65 && n.isAdult) bravesNear++;
        if (n.asleep && n.home && dist(n.x, n.y, n.home.x, n.home.y) < 1.5) continue; // aman di rumah
        if (d < bd) { bd = d; prey = n; }
      }
      // dikeroyok pemberani → kabur
      if (bravesNear >= 2) {
        this.log('🛡️ Warga pemberani mengusir serigala!', 'danger');
        this.wolves = this.wolves.filter(x => x !== wolf);
        for (const n of this.npcs) {
          if (dist(n.x, n.y, wolf.x, wolf.y) < 5 && n.traits.berani > 0.65) {
            n.logLife(this.world.day, 'ikut mengusir serigala');
          }
        }
        continue;
      }
      if (prey) {
        const d = dist(prey.x, prey.y, wolf.x, wolf.y);
        const dx = (prey.x - wolf.x) / (d || 1), dy = (prey.y - wolf.y) / (d || 1);
        const nx = wolf.x + dx * 0.09, ny = wolf.y + dy * 0.09;
        if (this.world.passable(nx, ny)) { wolf.x = nx; wolf.y = ny; }
        if (d < 0.9 && wolf.cooldown === 0) {
          wolf.cooldown = 120;
          prey.needs.energy = clamp(prey.needs.energy - 35, 0, 100);
          prey.addDanger(wolf.x, wolf.y, 2.2);
          prey.logLife(this.world.day, 'diserang serigala dan selamat');
          this.log(`🐺 ${prey.name} diserang serigala!`, 'danger');
          // teriakan → tetangga dekat ikut trauma (tanpa digigit)
          for (const n of this.npcs) {
            if (n !== prey && dist(n.x, n.y, wolf.x, wolf.y) < 8) n.addDanger(wolf.x, wolf.y, 0.9);
          }
          if (this.rng.chance(0.06)) this.kill(prey, 'diterkam serigala 🐺');
        }
      } else {
        wolf.x += this.rng.range(-0.06, 0.06);
        wolf.y += this.rng.range(-0.06, 0.06);
      }
    }
  }

  // ====== PERGANTIAN HARI ======
  dailyUpdate() {
    this.market.dailyUpdate(this);

    const day = this.world.day;
    if (day % 6 === 0) {
      this.log(`— Musim berganti: ${this.world.seasonName} —`, 'info');
      if (this.world.isWinter) this.log('❄️ Paceklik tiba. Semoga lumbung desa cukup...', 'danger');
    }

    for (const npc of [...this.npcs]) {
      if (!npc.alive) continue;
      npc.age++;
      npc.decayDangers();

      // dewasa
      if (npc.age === 14) {
        this.log(`🎉 ${npc.name} kini dewasa`, 'info');
        npc.logLife(day, 'menjadi dewasa');
      }
      // kematian usia tua — peluang naik seiring umur
      if (npc.age > 62 && this.rng.chance((npc.age - 60) * 0.012)) {
        this.kill(npc, `usia tua (${npc.age} th) 🕯️`);
        continue;
      }
      // kelahiran
      if (npc.sex === 'P' && npc.partner?.alive && npc.home && npc.isAdult && !npc.isElder) {
        const foodSecure = npc.inv.food + npc.partner.inv.food > 6;
        const kids = npc.children.filter(c => c.alive && !c.isAdult).length;
        // daya dukung lingkungan: makin padat desa, makin jarang kelahiran
        const capacity = Math.max(0.06, 1 - this.npcs.length / 85);
        if (foodSecure && kids < 3 && this.rng.chance(0.25 * capacity)) {
          this.birth(npc, npc.partner);
        }
      }
    }

    // harga makanan ekstrem → tajuk kronik
    if (this.market.prices.food > 4.5) this.log(`📈 Harga makanan melambung: ${this.market.prices.food} koin!`, 'econ');
  }

  birth(mom, dad) {
    // pewarisan sifat: rata-rata orang tua + mutasi → SELEKSI ALAM lintas generasi
    const mix = (a, b) => clamp((a + b) / 2 + this.rng.gauss(0, 0.09), 0.05, 0.95);
    const baby = new NPC(this.rng, this.nameGen, {
      age: 0,
      x: mom.home.x + this.rng.range(-0.5, 0.5),
      y: mom.home.y + this.rng.range(-0.5, 0.5),
      surname: dad.surname,
      parents: [mom, dad],
      traits: {
        rajin: mix(mom.traits.rajin, dad.traits.rajin),
        supel: mix(mom.traits.supel, dad.traits.supel),
        berani: mix(mom.traits.berani, dad.traits.berani),
        penasaran: mix(mom.traits.penasaran, dad.traits.penasaran),
      },
      food: 2, coins: 0,
    });
    baby.home = mom.home;
    // anak menyerap budaya orang tua
    for (const m of mom.memes) if (this.rng.chance(0.7)) baby.memes.add(m);
    for (const m of dad.memes) if (this.rng.chance(0.7)) baby.memes.add(m);
    mom.children.push(baby); dad.children.push(baby);
    this.npcs.push(baby);
    this.stats.births++;
    this.log(`👶 ${baby.name} lahir dari ${mom.name} & ${dad.name}`, 'birth');
    mom.logLife(this.world.day, `melahirkan ${baby.name}`);
  }

  kill(npc, cause) {
    npc.alive = false;
    npc.deathCause = cause;
    this.stats.deaths++;
    this.log(`⚰️ ${npc.name} meninggal — ${cause}`, 'death');
    // warisan ke pasangan / anak
    const heir = (npc.partner?.alive && npc.partner) || npc.children.find(c => c.alive);
    if (heir) {
      heir.inv.coins += npc.inv.coins;
      heir.inv.food += npc.inv.food;
      heir.inv.wood += npc.inv.wood;
      if (npc.home && !heir.home) heir.home = npc.home;
      heir.logLife(this.world.day, `mewarisi harta ${npc.name}`);
    }
    if (npc.partner) npc.partner.partner = null;
    if (npc.farm) { npc.farm.owner = null; npc.farm = null; }
    this.npcs = this.npcs.filter(n => n !== npc);
    // kenangan komunitas: yang kenal dekat kehilangan
    for (const n of this.npcs) {
      const op = n.opinions.get(npc.id);
      if (op && op.aff > 50) {
        n.needs.social = clamp(n.needs.social - 20, 0, 100);
        n.logLife(this.world.day, `berduka atas kepergian ${npc.name}`);
      }
    }
  }
}
