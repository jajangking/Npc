// ============================================================
// SPRITES — tileset pixel-art digambar prosedural saat load.
// Gaya TheoTown: objek lebih tinggi dari tile (pseudo-depth),
// warna hangat, detail kecil yang hidup.
// ============================================================
import { TILE } from './world.js';

export function hash(x, y) {
  let n = (x * 374761393 + y * 668265263) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function mk(w, h, fn) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  fn(g, w, h);
  return c;
}
const px = (g, x, y, c, w = 1, h = 1) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
const disc = (g, cx, cy, r, c) => {
  g.fillStyle = c;
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
    if (x * x + y * y <= r * r + 0.3) g.fillRect(cx + x, cy + y, 1, 1);
  }
};

export const S = {};

export function buildSprites() {
  const T = TILE;

  // ---------- RUMPUT (4 varian) ----------
  S.grass = [];
  for (let v = 0; v < 4; v++) {
    S.grass.push(mk(T, T, (g) => {
      px(g, 0, 0, v % 2 ? '#6da357' : '#71a75b', T, T);
      for (let i = 0; i < 14; i++) {
        const rx = Math.floor(hash(i, v * 7 + 1) * T), ry = Math.floor(hash(v * 13 + 2, i) * T);
        px(g, rx, ry, hash(i, v) > 0.5 ? '#639751' : '#7cab64');
      }
      // helai rumput
      for (let i = 0; i < 4; i++) {
        const rx = Math.floor(hash(i + 20, v) * (T - 1)), ry = Math.floor(hash(v, i + 20) * (T - 2));
        px(g, rx, ry, '#5c8f4b', 1, 2);
      }
      // bunga kecil di varian 3
      if (v === 3) {
        px(g, 4, 5, '#e8d44a'); px(g, 11, 10, '#e89ab8');
      }
    }));
  }

  // ---------- JALAN SETAPAK (overlay, muncul dari lalu lintas) ----------
  S.path = mk(T, T, (g) => {
    px(g, 0, 0, '#a08b62', T, T);
    for (let i = 0; i < 12; i++) {
      const rx = Math.floor(hash(i, 99) * T), ry = Math.floor(hash(99, i) * T);
      px(g, rx, ry, hash(i, 5) > 0.5 ? '#937e55' : '#ad9870');
    }
  });

  // ---------- AIR (3 frame animasi) ----------
  S.water = [];
  for (let f = 0; f < 3; f++) {
    S.water.push(mk(T, T, (g) => {
      px(g, 0, 0, '#3f74ad', T, T);
      for (let row = 0; row < 3; row++) {
        const y = 2 + row * 5;
        const off = Math.floor(hash(row, f) * 8) + f * 3;
        for (let i = 0; i < 2; i++) {
          px(g, (off + i * 8) % (T - 3), y + (f + row) % 2, '#4d84bd', 3, 1);
        }
      }
      px(g, (3 + f * 5) % T, (7 + f * 3) % T, '#9cc4e4');
      px(g, (11 + f * 4) % T, (13 + f * 5) % T, '#8ab8dc');
    }));
  }
  // buih tepian (utara/selatan/barat/timur)
  S.foamN = mk(T, 2, (g) => { px(g, 0, 0, 'rgba(216,236,247,0.55)', T, 1); px(g, 2, 1, 'rgba(216,236,247,0.3)', 3, 1); px(g, 10, 1, 'rgba(216,236,247,0.3)', 4, 1); });
  S.foamS = mk(T, 2, (g) => { px(g, 0, 1, 'rgba(160,200,228,0.45)', T, 1); });
  S.foamW = mk(2, T, (g) => { px(g, 0, 0, 'rgba(216,236,247,0.5)', 1, T); });
  S.foamE = mk(2, T, (g) => { px(g, 1, 0, 'rgba(216,236,247,0.5)', 1, T); });

  // ---------- TANAH SUBUR ----------
  S.fertile = mk(T, T, (g) => {
    px(g, 0, 0, '#7a5f3a', T, T);
    for (let r = 0; r < 4; r++) px(g, 0, 2 + r * 4, '#6e5433', T, 1);
    for (let i = 0; i < 8; i++) {
      px(g, Math.floor(hash(i, 44) * T), Math.floor(hash(44, i) * T), '#8a6f47');
    }
    px(g, 3, 6, '#5c8f4b'); px(g, 12, 11, '#5c8f4b');
  });

  // ---------- LADANG ----------
  S.farmBase = mk(T, T, (g) => {
    px(g, 0, 0, '#6e5230', T, T);
    for (let r = 0; r < 4; r++) {
      px(g, 0, 1 + r * 4, '#5d4527', T, 2);
      px(g, 0, 3 + r * 4, '#7a5c36', T, 1);
    }
  });
  // 4 tahap gandum
  S.wheat = [];
  const stageFn = [
    (g) => { for (let i = 0; i < 5; i++) px(g, 2 + i * 3, 12 - (i % 2), '#5c9a45', 1, 2); },
    (g) => { for (let i = 0; i < 5; i++) px(g, 2 + i * 3, 8 + (i % 2), '#4f8f3d', 1, 6); },
    (g) => {
      for (let i = 0; i < 5; i++) {
        px(g, 2 + i * 3, 5 + (i % 2), '#9aa845', 1, 9);
        px(g, 2 + i * 3, 4 + (i % 2), '#b8b84a');
      }
    },
    (g) => {
      for (let i = 0; i < 5; i++) {
        px(g, 2 + i * 3, 4 + (i % 2), '#c9a53a', 1, 10);
        px(g, 1 + i * 3, 2 + (i % 2), '#e8c84a', 2, 3);
      }
    },
  ];
  for (const fn of stageFn) S.wheat.push(mk(T, T, fn));

  // ---------- PLAZA / PASAR (lantai) ----------
  S.plaza = mk(T, T, (g) => {
    px(g, 0, 0, '#b3a284', T, T);
    for (let r = 0; r < 4; r++) {
      px(g, 0, r * 4, '#9d8d70', T, 1);
      px(g, (r % 2) * 8, r * 4, '#9d8d70', 1, 4);
      px(g, (r % 2) * 8 + 8, r * 4, '#9d8d70', 1, 4);
    }
    px(g, 5, 6, '#c2b294'); px(g, 12, 13, '#a89878');
  });

  // ---------- JALAN BATU ----------
  S.road = mk(T, T, (g) => {
    px(g, 0, 0, '#8f8574', T, T);
    // bebatuan
    const stones = [[2, 2, 4, 3], [8, 1, 5, 4], [1, 7, 5, 4], [8, 7, 6, 3], [3, 12, 5, 3], [10, 11, 4, 4]];
    for (let i = 0; i < stones.length; i++) {
      const [sx, sy, sw, sh] = stones[i];
      px(g, sx, sy, i % 2 ? '#9c9280' : '#a39986', sw, sh);
      px(g, sx, sy, '#aba08c', sw, 1);
    }
    px(g, 6, 5, '#7d7465'); px(g, 13, 6, '#7d7465'); px(g, 2, 11, '#7d7465');
  });

  // ---------- JEMBATAN KAYU ----------
  S.bridge = mk(T, T, (g) => {
    // papan horizontal
    for (let r = 0; r < 5; r++) {
      px(g, 0, r * 3 + 1, r % 2 ? '#a8835a' : '#9d7a50', T, 3);
      px(g, 0, r * 3 + 1, '#b58f63', T, 1);
    }
    // tepi gelap & pasak
    px(g, 0, 0, '#6b4a2a', T, 1); px(g, 0, T - 1, '#6b4a2a', T, 1);
    px(g, 2, 3, '#5a3c20'); px(g, 13, 3, '#5a3c20');
    px(g, 2, 12, '#5a3c20'); px(g, 13, 12, '#5a3c20');
  });

  // ---------- LUMBUNG DESA (bangunan besar) ----------
  S.granary = mk(22, 30, (g) => {
    // dinding lebar
    px(g, 2, 14, '#b5916a', 18, 15);
    for (let r = 0; r < 5; r++) px(g, 2, 16 + r * 3, '#a07c56', 18, 1);
    px(g, 2, 14, '#8a6b42', 1, 15); px(g, 19, 14, '#8a6b42', 1, 15);
    // pintu gandang besar
    px(g, 7, 20, '#7a5230', 8, 9);
    px(g, 7, 20, '#684425', 8, 1);
    px(g, 10, 20, '#684425', 1, 9); // belahan pintu
    // palang X khas lumbung
    px(g, 3, 15, '#8a6b42', 3, 1); px(g, 16, 15, '#8a6b42', 3, 1);
    // atap pelana tinggi
    for (let r = 0; r < 12; r++) {
      const half = 2 + r * 0.8;
      const c = r < 2 ? '#c05a42' : (r % 2 ? '#8a3a2e' : '#7c332a');
      px(g, Math.round(11 - half), r + 2, c, Math.round(half * 2), 1);
    }
    px(g, 0, 13, '#6b2a22', 22, 1);
    // jendela loteng
    px(g, 9, 6, '#4a3522', 4, 4);
    px(g, 10, 7, '#2e2420', 2, 2);
  });

  // ---------- RUMAH DUA LANTAI ----------
  const house2 = (lit) => mk(20, 32, (g) => {
    // dinding 2 lantai
    px(g, 2, 10, '#c2a176', 16, 21);
    for (let r = 0; r < 7; r++) px(g, 2, 12 + r * 3, '#ad8c62', 16, 1);
    px(g, 2, 10, '#8a6b42', 1, 21); px(g, 17, 10, '#8a6b42', 1, 21);
    // pembatas lantai
    px(g, 2, 20, '#8a6b42', 16, 1);
    // pintu
    px(g, 4, 24, '#7a5230', 4, 7);
    px(g, 7, 27, '#e8c84a');
    // jendela bawah & 2 jendela atas
    px(g, 12, 23, '#efe6d2', 4, 4); px(g, 13, 24, lit ? '#ffd871' : '#5a7a9a', 2, 2);
    px(g, 4, 13, '#efe6d2', 4, 4); px(g, 5, 14, lit ? '#ffd871' : '#5a7a9a', 2, 2);
    px(g, 12, 13, '#efe6d2', 4, 4); px(g, 13, 14, lit ? '#ffb84a' : '#4a6a8a', 2, 2);
    // atap
    for (let r = 0; r < 9; r++) {
      const half = 2 + r * 0.95;
      const c = r < 2 ? '#d9755a' : (r % 2 ? '#a8453a' : '#97392f');
      px(g, Math.round(10 - half), r + 1, c, Math.round(half * 2), 1);
    }
    px(g, 0, 10, '#7e2f26', 20, 1);
    // cerobong
    px(g, 14, 1, '#8a8578', 3, 6);
    px(g, 14, 1, '#6e6a5e', 3, 1);
  });
  S.house2 = house2(false);
  S.house2Lit = house2(true);

  // ---------- LAMPU JALAN ----------
  S.lamp = mk(8, 20, (g) => {
    px(g, 3, 4, '#3a332a', 2, 16);            // tiang
    px(g, 2, 18, '#2e2922', 4, 2);            // alas
    px(g, 1, 0, '#4a3f30', 6, 1);             // tudung
    px(g, 2, 1, '#e8c84a', 4, 4);             // kaca lentera
    px(g, 3, 2, '#fff2b0', 2, 2);             // nyala
    px(g, 2, 5, '#4a3f30', 4, 1);
  });

  // ---------- WARUNG MAKAN ----------
  S.warung = mk(18, 22, (g) => {
    // gerobak/meja warung
    px(g, 2, 12, '#9d7a50', 14, 9);
    for (let r = 0; r < 3; r++) px(g, 2, 14 + r * 3, '#8a6a44', 14, 1);
    px(g, 2, 12, '#b58f63', 14, 1);
    // kaca etalase
    px(g, 4, 14, '#efe6d2', 6, 4);
    px(g, 5, 15, '#e8c84a', 2, 2);   // nasi/lauk
    px(g, 7, 15, '#c0392b', 2, 2);
    // panci & uap
    px(g, 12, 10, '#6e6a5e', 4, 3);
    px(g, 13, 9, '#8a8578', 2, 1);
    // kanopi oranye
    for (let r = 0; r < 6; r++) {
      for (let cx = 0; cx < 18; cx += 3) {
        px(g, cx, 2 + r, (cx / 3) % 2 ? '#e8923a' : '#efe6d2', 3, 1);
      }
    }
    for (let cx = 0; cx < 18; cx += 3) px(g, cx + 0, 8, (cx / 3) % 2 ? '#d07f2e' : '#d8ccb4', 3, 1);
    px(g, 0, 1, '#a85a20', 18, 1);
    // tiang
    px(g, 2, 9, '#6b4a2a', 1, 12); px(g, 15, 9, '#6b4a2a', 1, 12);
    // spanduk kecil
    px(g, 6, 10, '#c0392b', 6, 2);
    px(g, 7, 10, '#fff', 1, 1); px(g, 9, 11, '#fff', 1, 1);
  });

  // ---------- KEDAI TEH ----------
  S.kedai = mk(18, 24, (g) => {
    // dinding gelap hangat
    px(g, 2, 11, '#8a6a48', 14, 12);
    for (let r = 0; r < 4; r++) px(g, 2, 13 + r * 3, '#7a5c3e', 14, 1);
    // pintu lebar terbuka
    px(g, 5, 15, '#4a3522', 5, 8);
    px(g, 6, 16, '#2e2420', 3, 7);
    // jendela hangat
    px(g, 12, 14, '#efe6d2', 3, 3);
    px(g, 12, 15, '#ffd871', 3, 2);
    // atap jerami
    for (let r = 0; r < 9; r++) {
      const half = 2 + r * 0.85;
      const c = r % 2 ? '#b89a4a' : '#a8883c';
      px(g, Math.round(9 - half), r + 1, c, Math.round(half * 2), 1);
    }
    px(g, 0, 10, '#8a7030', 18, 1);
    // lentera gantung
    px(g, 15, 11, '#3a332a', 1, 3);
    px(g, 14, 14, '#e8923a', 3, 3);
    px(g, 15, 15, '#fff2b0', 1, 1);
    // bangku depan
    px(g, 1, 21, '#6b4a2a', 4, 1);
    px(g, 1, 22, '#5a3c20', 1, 2); px(g, 4, 22, '#5a3c20', 1, 2);
  });

  // ---------- TAMAN (tile bunga) ----------
  S.park = mk(T, T, (g) => {
    px(g, 0, 0, '#79ab61', T, T);
    for (let i = 0; i < 10; i++) {
      const rx = Math.floor(hash(i, 77) * T), ry = Math.floor(hash(77, i) * T);
      px(g, rx, ry, '#6da357');
    }
    // bunga warna-warni
    const flo = [['#e89ab8', 3, 3], ['#e8d44a', 10, 5], ['#d46a9e', 6, 10], ['#efefef', 12, 12], ['#e8923a', 2, 12]];
    for (const [c, fx, fy] of flo) {
      px(g, fx, fy, c);
      px(g, fx, fy - 1, '#5c8f4b');
    }
    // jalur kerikil kecil
    px(g, 7, 0, '#c2b294', 2, T);
  });
  // bangku taman
  S.bench = mk(10, 8, (g) => {
    px(g, 0, 2, '#8a6b42', 10, 2);
    px(g, 0, 0, '#9d7c52', 10, 1);
    px(g, 1, 4, '#5a3c20', 1, 3); px(g, 8, 4, '#5a3c20', 1, 3);
  });

  // ---------- DERMAGA ----------
  S.pier = mk(T, T, (g) => {
    // papan vertikal menjorok
    px(g, 3, 0, '#a8835a', 10, T);
    for (let r = 0; r < 5; r++) px(g, 3, r * 3 + 1, '#95724c', 10, 1);
    px(g, 3, 0, '#6b4a2a', 1, T); px(g, 12, 0, '#6b4a2a', 1, T);
    // pancang
    px(g, 2, 3, '#5a3c20', 1, 4); px(g, 13, 9, '#5a3c20', 1, 4);
    // pagar ujung
    px(g, 3, 0, '#8a6b42', 10, 1);
  });

  // ---------- POHON (3 kepadatan × 2 varian) ----------
  const tree = (size, v) => mk(T, 28, (g) => {
    const bx = 8 + (v ? -1 : 0);
    // batang
    px(g, bx - 1, 19, '#6b4a2a', 3, 8);
    px(g, bx - 1, 19, '#5a3c20', 1, 8);
    if (size === 0) { // lebat
      disc(g, bx, 12, 7, '#2d5a28');
      disc(g, bx - 2, 10, 5, '#376b2f');
      disc(g, bx + 2, 9, 4, '#3f7a36');
      disc(g, bx, 7, 3, '#478339');
      px(g, bx - 3, 6, '#5a9a47'); px(g, bx + 1, 5, '#5a9a47'); px(g, bx - 1, 9, '#529044');
    } else if (size === 1) { // sedang
      disc(g, bx, 13, 5, '#2d5a28');
      disc(g, bx - 1, 11, 4, '#376b2f');
      disc(g, bx + 1, 9, 3, '#478339');
      px(g, bx, 7, '#5a9a47');
    } else { // jarang / muda
      disc(g, bx, 15, 3, '#376b2f');
      disc(g, bx, 12, 2, '#478339');
      px(g, bx, 10, '#5a9a47');
    }
  });
  S.tree = [[tree(0, 0), tree(0, 1)], [tree(1, 0), tree(1, 1)], [tree(2, 0), tree(2, 1)]];

  // ---------- SEMAK BERI ----------
  S.bush = mk(T, 14, (g) => {
    disc(g, 8, 8, 5, '#3f7a38');
    disc(g, 5, 7, 3, '#478339');
    disc(g, 11, 7, 3, '#478339');
    px(g, 4, 4, '#5a9a47'); px(g, 9, 3, '#5a9a47'); px(g, 12, 5, '#529044');
  });

  // ---------- BATU ----------
  S.rock = mk(T, 13, (g) => {
    disc(g, 8, 8, 4, '#8a8578');
    disc(g, 4, 9, 3, '#7e7a6d');
    px(g, 6, 4, '#a39e8f', 3, 1); px(g, 5, 5, '#a39e8f', 2, 1);
    px(g, 4, 11, '#6e6a5e', 8, 1);
  });

  // ---------- RUMAH (siang & malam) ----------
  const house = (lit) => mk(18, 24, (g) => {
    // dinding
    px(g, 2, 12, '#c2a176', 14, 11);
    for (let r = 0; r < 4; r++) px(g, 2, 14 + r * 3, '#ad8c62', 14, 1);
    px(g, 2, 12, '#8a6b42', 1, 11); px(g, 15, 12, '#8a6b42', 1, 11);
    // pintu
    px(g, 4, 16, '#7a5230', 4, 7);
    px(g, 4, 16, '#684425', 1, 7);
    px(g, 7, 19, '#e8c84a');
    // jendela
    px(g, 11, 15, '#efe6d2', 4, 4);
    px(g, 12, 16, lit ? '#ffd871' : '#5a7a9a', 2, 2);
    // atap
    for (let r = 0; r < 11; r++) {
      const half = 1.5 + r * 0.72;
      const c = r < 2 ? '#d9755a' : (r % 2 ? '#a8453a' : '#97392f');
      px(g, Math.round(9 - half), r + 1, c, Math.round(half * 2), 1);
    }
    px(g, 0, 12, '#7e2f26', 18, 1);
    // cerobong
    px(g, 13, 2, '#8a8578', 3, 5);
    px(g, 13, 2, '#6e6a5e', 3, 1);
  });
  S.house = house(false);
  S.houseLit = house(true);

  // ---------- LAPAK PASAR (2x2 tile, tinggi) ----------
  S.stall = mk(34, 32, (g) => {
    // tiang
    for (const tx of [3, 29]) { px(g, tx, 10, '#8a6b42', 2, 18); px(g, tx, 10, '#7a5c36', 1, 18); }
    // meja dagang
    px(g, 2, 20, '#a8835a', 30, 8);
    for (let r = 0; r < 3; r++) px(g, 2, 22 + r * 2, '#95724c', 30, 1);
    px(g, 2, 20, '#bb9568', 30, 1);
    // dagangan
    px(g, 5, 16, '#b89468', 7, 5); px(g, 5, 16, '#9d7c52', 7, 1); // peti
    px(g, 6, 14, '#c0392b', 2, 2); px(g, 9, 14, '#c0392b', 2, 2); // apel
    px(g, 15, 17, '#e8c84a', 6, 3); px(g, 16, 16, '#d9b83a', 4, 1); // gandum
    px(g, 24, 16, '#8a5a35', 4, 4); // karung
    // kanopi garis-garis
    for (let r = 0; r < 8; r++) {
      const wdt = 34 - Math.abs(r - 1) * 0;
      for (let cx = 0; cx < 34; cx += 4) {
        px(g, cx, 2 + r, (cx / 4) % 2 ? '#efe6d2' : '#c0392b', 4, 1);
      }
    }
    // tepi kanopi bergerigi
    for (let cx = 0; cx < 34; cx += 4) {
      px(g, cx + 1, 10, (cx / 4) % 2 ? '#d8ccb4' : '#a83226', 2, 2);
    }
    px(g, 0, 1, '#7e2f26', 34, 1);
  });
}
