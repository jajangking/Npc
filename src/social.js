import { clamp, dist } from './rng.js';

// ============================================================
// SOSIAL & BUDAYA — gosip menyebarkan pengetahuan, trauma,
// opini, dan kebiasaan (meme budaya). Budaya menyebar organik
// dari mulut ke mulut, bisa punah, bisa mendominasi.
// ============================================================

export const MEME_POOL = [
  { id: 'tarian_senja', name: 'Tarian Senja', emoji: '💃' },
  { id: 'pai_beri', name: 'Tradisi Pai Beri', emoji: '🥧' },
  { id: 'nyanyian_sungai', name: 'Nyanyian Sungai', emoji: '🎶' },
  { id: 'salam_dahi', name: 'Salam Sentuh Dahi', emoji: '🙇' },
  { id: 'puasa_purnama', name: 'Puasa Purnama', emoji: '🌕' },
  { id: 'ukir_totem', name: 'Ukiran Totem Kayu', emoji: '🗿' },
  { id: 'teh_sore', name: 'Minum Teh Sore', emoji: '🍵' },
  { id: 'cerita_api', name: 'Cerita di Perapian', emoji: '🔥' },
];

// Satu percakapan: dua kepala saling "menular"
export function conversation(a, b, sim) {
  const rng = a.rng;
  const oa = a.opinionOf(b.id), ob = b.opinionOf(a.id);
  oa.meets++; ob.meets++;

  // Kecocokan kepribadian menentukan arah relasi
  const compat =
    1.6 - Math.abs(a.traits.rajin - b.traits.rajin) -
    Math.abs(a.traits.penasaran - b.traits.penasaran) * 0.7;
  const spark = rng.gauss(compat * 2.2, 3.5);
  oa.aff = clamp(oa.aff + spark + b.skills.pesona * 2, -100, 100);
  ob.aff = clamp(ob.aff + spark + a.skills.pesona * 2, -100, 100);

  // 1) GOSIP PENGETAHUAN: berbagi lokasi sumber daya terbaik
  shareSpot(a, b, sim); shareSpot(b, a, sim);

  // 2) GOSIP TRAUMA: "jangan ke sana, ada serigala!"
  shareDanger(a, b); shareDanger(b, a);

  // 3) GOSIP OPINI: opini tentang orang ketiga ikut menular
  shareOpinion(a, b, rng); shareOpinion(b, a, rng);

  // 4) BUDAYA MENULAR
  shareMeme(a, b, sim); shareMeme(b, a, sim);
}

function shareSpot(from, to, sim) {
  const good = from.spots.filter(s => s.est > 1);
  if (!good.length) return;
  const s = good[Math.floor(from.rng.rand() * good.length)];
  const isNew = to.remember(s.x, s.y, s.kind, s.est * 0.8, sim.world.tick); // info bekas orang: sedikit didiskon
  if (isNew && from.rng.chance(0.12)) {
    to.thought = `dengar-dengar ada ${spotName(s.kind)} bagus dari ${from.name}`;
  }
}

function spotName(kind) {
  return { bush: 'semak beri', wood: 'hutan kayu', fish: 'spot mancing', fertile: 'tanah subur' }[kind] || 'tempat';
}

function shareDanger(from, to) {
  if (!from.dangers.length) return;
  const d = from.dangers[Math.floor(from.rng.rand() * from.dangers.length)];
  if (d.mag > 0.4) to.addDanger(d.x, d.y, d.mag * 0.5); // cerita orang tidak semenakutkan pengalaman sendiri
}

function shareOpinion(from, to, rng) {
  const ids = [...from.opinions.keys()].filter(id => id !== to.id);
  if (!ids.length) return;
  const cid = ids[Math.floor(rng.rand() * ids.length)];
  const fromOp = from.opinions.get(cid).aff;
  if (Math.abs(fromOp) < 15) return;
  const toOp = to.opinionOf(cid);
  // makin percaya ke si pembicara, makin terpengaruh
  const trust = clamp(to.opinionOf(from.id).aff / 100, 0, 0.6);
  toOp.aff = clamp(toOp.aff + (fromOp - toOp.aff) * 0.1 * (0.4 + trust), -100, 100);
}

function shareMeme(from, to, sim) {
  if (!from.memes.size) return;
  const memes = [...from.memes];
  const m = memes[Math.floor(from.rng.rand() * memes.length)];
  if (to.memes.has(m)) return;
  const p = 0.18 + from.skills.pesona * 0.3 + clamp(to.opinionOf(from.id).aff / 200, 0, 0.25);
  if (from.rng.chance(p)) {
    to.memes.add(m);
    const def = MEME_POOL.find(x => x.id === m);
    if (def && sim.countMeme(m) === Math.ceil(sim.npcs.length * 0.5)) {
      sim.log(`${def.emoji} "${def.name}" kini dianut separuh desa!`, 'culture');
    }
  }
}

// Sesekali seseorang yang kreatif MENCIPTAKAN kebiasaan baru
export function maybeInventMeme(npc, sim) {
  if (!npc.isAdult) return;
  if (!npc.rng.chance(0.003 * npc.traits.penasaran)) return;
  const unknown = MEME_POOL.filter(m => !sim.anyoneHasMeme(m.id));
  if (!unknown.length) return;
  const m = unknown[Math.floor(npc.rng.rand() * unknown.length)];
  npc.memes.add(m.id);
  sim.log(`${m.emoji} ${npc.name} memulai kebiasaan baru: "${m.name}"`, 'culture');
  npc.logLife(sim.world.day, `menciptakan tradisi "${m.name}"`);
}
