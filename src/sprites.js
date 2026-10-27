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
