// ============================================================
// SPRITES ISOMETRIK — gaya TheoTown "3D": proyeksi diamond 2:1,
// bangunan menjulang dengan dua dinding bershading + atap
// piramida. Semua digambar prosedural saat load.
// ============================================================

export const IW = 32, IH = 16;   // ukuran diamond tile

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

// ---- util warna ----
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 255) * f) | 0;
  const g = Math.min(255, ((n >> 8) & 255) * f) | 0;
  const b = Math.min(255, (n & 255) * f) | 0;
  return `rgb(${r},${g},${b})`;
}

function poly(g, pts, c) {
  g.fillStyle = c;
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.closePath();
  g.fill();
}

function diamondPath(g, ox, oy, w = IW, h = IH) {
  g.beginPath();
  g.moveTo(ox + w / 2, oy);
  g.lineTo(ox + w, oy + h / 2);
  g.lineTo(ox + w / 2, oy + h);
  g.lineTo(ox, oy + h / 2);
  g.closePath();
}

// tile dasar ber-clip diamond
function tile(fn) {
  return mk(IW, IH, (g) => {
    g.save();
    diamondPath(g, 0, 0);
    g.clip();
    fn(g);
    g.restore();
  });
}

const px = (g, x, y, c, w = 1, h = 1) => { g.fillStyle = c; g.fillRect(x, y, w, h); };

// ============================================================
// GEDUNG ISO: dinding kiri (gelap) + kanan (terang) + atap piramida
// ============================================================
function building({ wallH = 12, roofPeak = 10, wall = '#c2a176', roof = '#a8453a',
  eave = 2, decorate = null, roofStripes = null, posts = false }) {
  const rH = roofPeak + 4;
  const H = rH + wallH + IH;
  return mk(IW, H, (g) => {
    const fy = rH + wallH;   // y puncak diamond lantai
    const L = [0, fy + 8], B = [16, fy + 16], R = [32, fy + 8], T_ = [16, fy];
    const Lt = [0, rH + 8], Bt = [16, rH + 16], Rt = [32, rH + 8];

    if (posts) {
      // bangunan terbuka (pendopo/lapak): hanya tiang
      for (const [cx, cy] of [[2, rH + 9], [16, rH + 17], [30, rH + 9]]) {
        px(g, cx - 1, cy, shade('#6b4a2a', 0.8), 2, wallH);
      }
      px(g, 15, rH + 16, '#6b4a2a', 2, wallH); // tiang depan
    } else {
      // dinding kiri (bayangan) & kanan (cahaya)
      poly(g, [Lt, Bt, B, L], shade(wall, 0.68));
      poly(g, [Bt, Rt, R, B], shade(wall, 0.95));
      // garis papan horizontal
      g.strokeStyle = 'rgba(0,0,0,0.12)';
      for (let i = 4; i < wallH; i += 4) {
        g.beginPath(); g.moveTo(0, rH + 8 + i); g.lineTo(16, rH + 16 + i); g.stroke();
        g.beginPath(); g.moveTo(16, rH + 16 + i); g.lineTo(32, rH + 8 + i); g.stroke();
      }
    }

    if (decorate) decorate(g, rH, wallH);

    // atap piramida dengan tritisan (eave)
    const apex = [16, 4 - Math.min(0, 0)];
    const eL = [0 - 0, rH + 8], eB = [16, rH + 16 + 0], eR = [32, rH + 8];
    const aPt = [16, rH + 8 - roofPeak - 4];
    // wajah kiri atap (gelap) & kanan (terang)
    poly(g, [aPt, [eL[0] - 0, eL[1] + eave - 2], [eB[0], eB[1] + eave]], shade(roof, 0.72));
    poly(g, [aPt, [eB[0], eB[1] + eave], [eR[0], eR[1] + eave - 2]], shade(roof, 1.0));
    if (roofStripes) {
      // garis-garis kanopi (pasar/warung)
      g.save();
      g.beginPath();
      g.moveTo(aPt[0], aPt[1]);
      g.lineTo(eL[0], eL[1] + eave - 2);
      g.lineTo(eB[0], eB[1] + eave);
      g.lineTo(eR[0], eR[1] + eave - 2);
      g.closePath();
      g.clip();
      for (let i = -3; i < 8; i++) {
        g.fillStyle = i % 2 ? roofStripes : 'rgba(0,0,0,0)';
        g.save();
        g.translate(16, aPt[1]);
        g.rotate(0.0);
        g.fillRect(-20 + i * 5, 0, 3, 40);
        g.restore();
      }
      g.restore();
    }
    // garis bubungan
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    g.beginPath(); g.moveTo(aPt[0], aPt[1]); g.lineTo(16, rH + 16 + eave); g.stroke();
  });
}

export const S = {};

export function buildSprites() {
  // ---------- TANAH ----------
  S.grass = [];
  for (let v = 0; v < 4; v++) {
    S.grass.push(tile((g) => {
      px(g, 0, 0, v % 2 ? '#6da357' : '#71a75b', IW, IH);
      for (let i = 0; i < 16; i++) {
        px(g, Math.floor(hash(i, v) * IW), Math.floor(hash(v, i) * IH),
          hash(i, v + 9) > 0.5 ? '#639751' : '#7cab64', 2, 1);
      }
      if (v === 3) { px(g, 10, 6, '#e8d44a'); px(g, 22, 10, '#e89ab8'); }
    }));
  }

  S.path = tile((g) => {
    px(g, 0, 0, '#a08b62', IW, IH);
    for (let i = 0; i < 14; i++) {
      px(g, Math.floor(hash(i, 99) * IW), Math.floor(hash(99, i) * IH),
        hash(i, 5) > 0.5 ? '#937e55' : '#ad9870', 2, 1);
    }
  });

  S.water = [];
  for (let f = 0; f < 3; f++) {
    S.water.push(tile((g) => {
      px(g, 0, 0, '#3f74ad', IW, IH);
      for (let r = 0; r < 3; r++) {
        const y = 3 + r * 4;
        px(g, (3 + f * 4 + r * 7) % 26, y, '#4d84bd', 5, 1);
      }
      px(g, (6 + f * 7) % 28, (5 + f * 2) % 12, '#9cc4e4', 2, 1);
    }));
  }

  S.fertile = tile((g) => {
    px(g, 0, 0, '#7a5f3a', IW, IH);
    for (let r = 0; r < 4; r++) px(g, 0, 2 + r * 4, '#6e5433', IW, 1);
    px(g, 8, 6, '#5c8f4b'); px(g, 20, 10, '#5c8f4b');
  });

  S.farmBase = tile((g) => {
    px(g, 0, 0, '#6e5230', IW, IH);
    // alur bajak searah iso
    g.strokeStyle = '#5d4527';
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      g.moveTo(2 + i * 3, 8 - i * 1.5 + 4);
      g.lineTo(18 + i * 3, 16 - i * 1.5 + 4);
      g.stroke();
    }
  });

  // gandum berdiri di atas tile (overlay)
  S.wheat = [];
  const stages = [
    { h: 2, c: '#5c9a45', head: null },
    { h: 5, c: '#4f8f3d', head: null },
    { h: 8, c: '#9aa845', head: '#b8b84a' },
    { h: 9, c: '#c9a53a', head: '#e8c84a' },
  ];
  for (const st of stages) {
    S.wheat.push(mk(IW, IH + 10, (g) => {
      const pos = [[10, 14], [16, 12], [22, 14], [13, 17], [19, 17], [16, 20]];
      for (const [sx, sy] of pos) {
        px(g, sx, sy + 10 - st.h - 10 + 10 - 0, st.c, 1, st.h);
        if (st.head) px(g, sx - 1, sy - st.h + 10 - 0 - 2, st.head, 2, 3);
      }
    }));
  }

  S.plaza = tile((g) => {
    px(g, 0, 0, '#b3a284', IW, IH);
    g.strokeStyle = '#9d8d70';
    for (let i = 0; i < 4; i++) {
      g.beginPath(); g.moveTo(i * 8, 4 + i * 2); g.lineTo(16 + i * 8, 12 + i * 2 - 8); g.stroke();
    }
    px(g, 12, 7, '#c2b294', 3, 1); px(g, 20, 10, '#a89878', 3, 1);
  });

  S.road = tile((g) => {
    px(g, 0, 0, '#8f8574', IW, IH);
    const st = [[4, 6, 5, 3], [12, 3, 6, 3], [20, 7, 6, 3], [10, 10, 6, 3], [22, 11, 4, 2], [15, 6, 4, 2]];
    for (let i = 0; i < st.length; i++) {
      px(g, st[i][0], st[i][1], i % 2 ? '#9c9280' : '#a39986', st[i][2], st[i][3]);
    }
    px(g, 8, 4, '#7d7465', 2, 1); px(g, 24, 9, '#7d7465', 2, 1);
  });

  S.park = tile((g) => {
    px(g, 0, 0, '#79ab61', IW, IH);
    const flo = [['#e89ab8', 8, 5], ['#e8d44a', 20, 7], ['#d46a9e', 13, 11], ['#efefef', 24, 10], ['#e8923a', 6, 9]];
    for (const [c, fx, fy] of flo) { px(g, fx, fy, c, 2, 1); px(g, fx, fy - 1, '#5c8f4b'); }
  });

  S.bridge = tile((g) => {
    px(g, 0, 0, '#a8835a', IW, IH);
    g.strokeStyle = '#8a6a44';
    for (let i = 0; i < 4; i++) {
      g.beginPath(); g.moveTo(i * 8, 4 + i * 2); g.lineTo(16 + i * 8, i * 2 + 4 - 8 + 8); g.stroke();
    }
    px(g, 2, 7, '#6b4a2a', 2, 2); px(g, 28, 7, '#6b4a2a', 2, 2);
  });

  S.pier = tile((g) => {
    px(g, 0, 0, '#3f74ad', IW, IH);
    // papan menjorok
    poly(g, [[10, 2], [26, 10], [20, 13], [4, 5]], '#a8835a');
    poly(g, [[10, 2], [26, 10], [25, 11], [9, 3]], '#b58f63');
    px(g, 6, 6, '#5a3c20', 2, 4); px(g, 22, 12, '#5a3c20', 2, 3);
  });

  // ---------- POHON ----------
  const tree = (size) => mk(IW, 40, (g) => {
    const bx = 16;
    const baseY = 34;
    px(g, bx - 1, baseY - 8, '#5a3c20', 3, 8);
    const r = size === 0 ? 9 : size === 1 ? 7 : 4;
    const ty = baseY - 10;
    // tajuk bulat berlapis (gelap→terang kiri-kanan)
    g.fillStyle = '#2d5a28';
    g.beginPath(); g.ellipse(bx, ty - r * 0.6, r + 1, r, 0, 0, 7); g.fill();
    g.fillStyle = '#3f7a36';
    g.beginPath(); g.ellipse(bx + 1, ty - r * 0.8, r - 1, r - 1.5, 0, 0, 7); g.fill();
    g.fillStyle = '#5a9a47';
    g.beginPath(); g.ellipse(bx + 2, ty - r, r - 3.5, r - 4 < 1 ? 1 : r - 4, 0, 0, 7); g.fill();
  });
  S.tree = [tree(0), tree(1), tree(2)];

  S.bush = mk(IW, 20, (g) => {
    g.fillStyle = '#3f7a38';
    g.beginPath(); g.ellipse(16, 13, 8, 5, 0, 0, 7); g.fill();
    g.fillStyle = '#4f8f44';
    g.beginPath(); g.ellipse(17, 11, 5, 3, 0, 0, 7); g.fill();
  });

  S.rock = mk(IW, 18, (g) => {
    poly(g, [[8, 14], [13, 5], [20, 6], [25, 13], [20, 16], [12, 16]], '#8a8578');
    poly(g, [[13, 5], [20, 6], [18, 9], [12, 9]], '#a39e8f');
    poly(g, [[8, 14], [12, 16], [20, 16], [25, 13], [23, 15], [10, 15.5]], '#6e6a5e');
  });

  // ---------- BANGUNAN ----------
  const houseDecor = (lit) => (g, rH, wallH) => {
    // pintu di dinding kanan
    poly(g, [[20, rH + 18], [25, rH + 15.5], [25, rH + 15.5 + 8], [20, rH + 18 + 8]], '#5a3c20');
    // jendela dinding kanan
    poly(g, [[27, rH + 14.5], [30, rH + 13], [30, rH + 17], [27, rH + 18.5]], lit ? '#ffd871' : '#5a7a9a');
    // jendela dinding kiri
    poly(g, [[4, rH + 13], [8, rH + 15], [8, rH + 19], [4, rH + 17]], lit ? shade('#ffd871', 0.8) : '#4a6a8a');
  };
  // Variasi rumah — tiap rumah beda gaya (dipilih dari hash posisi tile):
  // terakota klasik, atap lumut, sirap kayu, dan batu tulis kelabu
  const HOUSE_PAL = [
    { wall: '#c2a176', roof: '#a8453a', wallH: 12, peak: 9 },
    { wall: '#cdb892', roof: '#5f7a4a', wallH: 13, peak: 8 },
    { wall: '#a98a68', roof: '#8a6f54', wallH: 11, peak: 10 },
    { wall: '#9c8468', roof: '#5d5f74', wallH: 12, peak: 9 },
  ];
  S.house = HOUSE_PAL.map(p => building({
    wallH: p.wallH, roofPeak: p.peak, wall: p.wall, roof: p.roof, decorate: houseDecor(false) }));
  S.houseLit = HOUSE_PAL.map(p => building({
    wallH: p.wallH, roofPeak: p.peak, wall: p.wall, roof: p.roof, decorate: houseDecor(true) }));

  const house2Deco = (lit) => (g, rH, wH) => {
    houseDecor(lit)(g, rH + 10, wH);
    const win = lit ? '#ffb84a' : '#4a6a8a';
    poly(g, [[27, rH + 7], [30, rH + 5.5], [30, rH + 9.5], [27, rH + 11]], win);
    poly(g, [[4, rH + 6], [8, rH + 8], [8, rH + 12], [4, rH + 10]], win);
  };
  S.house2 = HOUSE_PAL.map(p => building({
    wallH: 22, roofPeak: 10, wall: p.wall, roof: p.roof, decorate: house2Deco(false) }));
  S.house2Lit = HOUSE_PAL.map(p => building({
    wallH: 22, roofPeak: 10, wall: p.wall, roof: p.roof, decorate: house2Deco(true) }));

  S.granary = building({ wallH: 18, roofPeak: 12, wall: '#b5916a', roof: '#7c332a', decorate: (g, rH) => {
    // pintu gandang besar
    poly(g, [[18, rH + 20], [28, rH + 15], [28, rH + 15 + 11], [18, rH + 20 + 11]], '#6a4426');
    g.strokeStyle = '#8a6b42';
    g.beginPath(); g.moveTo(18, rH + 20); g.lineTo(28, rH + 26); g.stroke();
    g.beginPath(); g.moveTo(28, rH + 15); g.lineTo(18, rH + 31); g.stroke();
  } });

  S.market = building({ wallH: 10, roofPeak: 9, wall: '#c9a86a', roof: '#c0392b', posts: true, roofStripes: '#efe6d2',
    decorate: (g, rH) => {
      // meja dagangan
      poly(g, [[6, rH + 16], [26, rH + 16], [22, rH + 22], [10, rH + 22]], '#9d7a50');
      px(g, 12, rH + 17, '#e8c84a', 3, 2); px(g, 17, rH + 17, '#c0392b', 3, 2);
    } });

  S.warung = building({ wallH: 9, roofPeak: 8, wall: '#9d7a50', roof: '#e8923a', roofStripes: '#efe6d2',
    decorate: (g, rH) => {
      poly(g, [[20, rH + 16], [29, rH + 11.5], [29, rH + 17], [20, rH + 21]], '#efe6d2');
      px(g, 22, rH + 16, '#e8c84a', 2, 2); px(g, 25, rH + 15, '#c0392b', 2, 2);
    } });

  S.kedai = building({ wallH: 11, roofPeak: 10, wall: '#8a6a48', roof: '#b89a4a',
    decorate: (g, rH) => {
      poly(g, [[20, rH + 17], [25, rH + 14.5], [25, rH + 22.5], [20, rH + 25]], '#3a2c1c');
      px(g, 27, rH + 13, '#e8923a', 3, 3);
      px(g, 28, rH + 14, '#fff2b0', 1, 1);
    } });

  S.school = building({ wallH: 14, roofPeak: 9, wall: '#e8dfc8', roof: '#5a7a9a',
    decorate: (g, rH) => {
      poly(g, [[19, rH + 19], [24, rH + 16.5], [24, rH + 24.5], [19, rH + 27]], '#5a3c20');
      poly(g, [[26, rH + 15], [30, rH + 13], [30, rH + 17], [26, rH + 19]], '#9cc4e4');
      poly(g, [[3, rH + 13], [8, rH + 15.5], [8, rH + 19.5], [3, rH + 17]], '#9cc4e4');
      // bendera
      px(g, 15, rH - 14, '#6b4a2a', 1, 10);
      px(g, 16, rH - 14, '#c0392b', 5, 3);
    } });

  S.hall = building({ wallH: 16, roofPeak: 11, wall: '#c9a86a', roof: '#8a5a35',
    decorate: (g, rH) => {
      poly(g, [[18, rH + 20], [26, rH + 16], [26, rH + 25], [18, rH + 29]], '#6a4426');
      poly(g, [[28, rH + 15], [31, rH + 13.5], [31, rH + 17.5], [28, rH + 19]], '#ffd871');
      poly(g, [[3, rH + 14], [7, rH + 16], [7, rH + 20], [3, rH + 18]], '#ffd871');
      // panji emas di puncak
      px(g, 15, rH - 16, '#6b4a2a', 1, 10);
      px(g, 16, rH - 16, '#e8c84a', 5, 3);
    } });

  // pendopo: joglo — atap bertingkat tanpa dinding
  S.pendopo = mk(IW, 42, (g) => {
    const fy = 26;
    // lantai panggung
    diamondPath(g, 0, fy);
    g.fillStyle = '#9d7a50'; g.fill();
    // tiang
    for (const [cx, cy] of [[3, fy + 8], [16, fy + 15], [29, fy + 8], [16, fy + 1]]) {
      px(g, cx - 1, cy - 12, '#5a3c20', 2, 13);
    }
    // atap joglo dua tingkat
    poly(g, [[16, 0], [-1, 18], [16, 26]], shade('#7a4a30', 0.7));
    poly(g, [[16, 0], [16, 26], [33, 18]], '#7a4a30');
    poly(g, [[16, 6], [3, 19], [16, 24]], shade('#8a5a3a', 0.72));
    poly(g, [[16, 6], [16, 24], [29, 19]], '#8a5a3a');
    px(g, 15, 0, '#e8c84a', 2, 3); // mustaka emas
  });

  S.lamp = mk(10, 26, (g) => {
    px(g, 4, 6, '#3a332a', 2, 18);
    px(g, 3, 23, '#2e2922', 4, 2);
    px(g, 2, 0, '#4a3f30', 6, 1);
    px(g, 3, 1, '#e8c84a', 4, 4);
    px(g, 4, 2, '#fff2b0', 2, 2);
    px(g, 3, 5, '#4a3f30', 4, 1);
  });

  S.bench = mk(12, 10, (g) => {
    poly(g, [[1, 4], [9, 0], [11, 2], [3, 6]], '#9d7c52');
    px(g, 2, 5, '#5a3c20', 1, 4); px(g, 9, 2, '#5a3c20', 1, 4);
  });
}
