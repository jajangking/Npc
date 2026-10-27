// ============================================================
// TEKNOLOGI — kemajuan peradaban yang EMERGENT, bukan timeline.
// Pengetahuan desa terkumpul dari aktivitas nyata warga, dan
// penemuan terjadi (dengan peluang) saat kondisinya matang.
// Pengetahuan ikut terkubur bersama warga yang mati — desa
// bisa mengalami kemunduran kalau terlalu banyak ahli tewas.
// ============================================================

export const TECHS = [
  {
    id: 'jalan_batu', name: 'Jalan Batu', emoji: '🛣️', skill: 'kayu',
    req: { kayu: 22, konstruksi: 16 }, pop: 9,
    desc: 'jalur setapak yang ramai kini bisa dilapisi batu — perjalanan jauh lebih cepat',
  },
  {
    id: 'jembatan', name: 'Jembatan Kayu', emoji: '🌉', skill: 'kayu',
    req: { kayu: 45, konstruksi: 40 }, pop: 12,
    desc: 'sungai bukan lagi tembok — dunia di seberang terbuka',
  },
  {
    id: 'gerobak', name: 'Gerobak Dorong', emoji: '🛞', skill: 'kayu',
    req: { kayu: 50, dagang: 8 }, pop: 12, after: ['jalan_batu'],
    desc: 'roda kayu! pengrajin bisa membuat gerobak pribadi untuk mengangkut lebih banyak',
  },
  {
    id: 'lumbung', name: 'Lumbung Desa', emoji: '🛖', skill: 'tani',
    req: { tani: 45, konstruksi: 40 }, pop: 11,
    desc: 'panen bisa disimpan bersama — paceklik tak lagi semenakutkan dulu',
  },
  {
    id: 'rumah_besar', name: 'Rumah Papan Besar', emoji: '🏡', skill: 'kayu',
    req: { kayu: 55, konstruksi: 70 }, pop: 16, after: ['jalan_batu'],
    desc: 'rumah dua lantai dengan kamar yang layak — tidur jauh lebih nyenyak',
  },
  {
    id: 'lampu_jalan', name: 'Lampu Jalan', emoji: '🏮', skill: 'dagang',
    req: { konstruksi: 70, dagang: 11 }, pop: 16, after: ['jalan_batu', 'rumah_besar'],
    desc: 'malam tak lagi gelap gulita — serigala enggan mendekati cahaya',
  },
  {
    id: 'pandai_besi', name: 'Pandai Besi', emoji: '🔨', skill: 'kayu',
    req: { kayu: 70, konstruksi: 85 }, pop: 18, after: ['rumah_besar'],
    desc: 'api tempa menyala! perkakas besi membuat kerja jauh lebih efisien',
  },
  {
    id: 'menara_jaga', name: 'Menara Jaga', emoji: '🗼', skill: 'kayu',
    req: { kayu: 60, konstruksi: 75 }, pop: 15, after: ['jalan_batu'],
    cond: (sim) => (sim.wolfAttacks || 0) >= 3,
    desc: 'luka-luka lama serigala melahirkan tekad: desa harus punya mata yang berjaga',
  },
  {
    id: 'candi', name: 'Candi Agung', emoji: '🛕', skill: 'kayu',
    req: { konstruksi: 130, dagang: 40, tani: 90 }, pop: 20, after: ['pandai_besi'],
    cond: (sim) => !!sim.leader,
    desc: 'di bawah pimpinan kepala desa, warga bermimpi membangun candi — penanda zaman keemasan',
  },
];

export function eraName(nTech) {
  if (nTech === 0) return 'Dusun Perintis';
  if (nTech <= 2) return 'Desa Berkembang';
  if (nTech <= 4) return 'Desa Maju';
  if (nTech <= 6) return 'Kota Kecil';
  if (nTech <= 8) return 'Kota Makmur';
  return 'Era Keemasan 👑';
}

export function checkDiscoveries(sim) {
  for (const t of TECHS) {
    if (sim.techs.has(t.id)) continue;
    if ((t.after || []).some((a) => !sim.techs.has(a))) continue;
    if (t.cond && !t.cond(sim)) continue;
    if (sim.npcs.length < (t.pop || 0)) continue;
    if (Object.entries(t.req).some(([k, v]) => sim.know[k] < v)) continue;

    // kandidat penemu: paling terampil di bidangnya + paling penasaran
    let inv = null, bv = -1;
    for (const n of sim.npcs) {
      if (!n.isAdult) continue;
      const v = (n.skills[t.skill] || 0.2) + n.traits.penasaran;
      if (v > bv) { bv = v; inv = n; }
    }
    if (!inv) continue;

    if (sim.rng.chance(0.06 + inv.traits.penasaran * 0.14)) {
      const prevEra = eraName(sim.techs.size);
      sim.techs.add(t.id);
      sim.log(`${t.emoji} PENEMUAN! ${inv.name} menemukan ${t.name} — ${t.desc}`, 'tech');
      inv.logLife(sim.world.day, `menemukan ${t.name}`);
      inv.memes.add('penemu_' + t.id); // kebanggaan pribadi
      // prestise: seisi desa mengagumi sang penemu
      for (const o of sim.npcs) {
        if (o !== inv) {
          const op = o.opinionOf(inv.id);
          op.aff = Math.min(100, op.aff + 12);
        }
      }
      const era = eraName(sim.techs.size);
      if (era !== prevEra) sim.log(`🏛️ Desa memasuki zaman baru: ${era.toUpperCase()}!`, 'tech');
    }
  }
}
