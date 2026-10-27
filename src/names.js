const MALE = ['Arga', 'Bimo', 'Cakra', 'Damar', 'Elang', 'Galang', 'Hasta', 'Jaka',
  'Kala', 'Lanang', 'Mahesa', 'Narada', 'Panji', 'Raka', 'Sadewa', 'Teja',
  'Wira', 'Yudha', 'Baskara', 'Candra', 'Gending', 'Lintang', 'Satya', 'Wisnu'];

const FEMALE = ['Anjani', 'Banowati', 'Citra', 'Dewi', 'Endah', 'Gayatri', 'Hira',
  'Intan', 'Kirana', 'Laksmi', 'Maharani', 'Nawang', 'Padmi', 'Ratih', 'Sekar',
  'Tirta', 'Utari', 'Widuri', 'Arum', 'Dahlia', 'Larasati', 'Mentari', 'Puspa', 'Sri'];

const SURNAME = ['Wanakerta', 'Girilaya', 'Tirtayasa', 'Megaloka', 'Argasoka',
  'Candrakanta', 'Banyubiru', 'Suryaloka', 'Wukirsari', 'Padangratu',
  'Kertabumi', 'Jatiwangi', 'Sambilegi', 'Karanggeneng'];

export function makeNameGen(rng) {
  const used = new Set();
  return {
    first(sex) {
      const pool = sex === 'L' ? MALE : FEMALE;
      for (let i = 0; i < 40; i++) {
        const n = rng.pick(pool);
        if (!used.has(n)) { used.add(n); return n; }
      }
      const n = rng.pick(pool) + ' ' + rng.int(2, 9);
      used.add(n);
      return n;
    },
    surname() { return rng.pick(SURNAME); },
    free(n) { used.delete(n); },
    reserve(n) { used.add(n); },
  };
}
