import { W, H, TILE, T } from './world.js';
import { ACTIONS } from './actions.js';
import { dist } from './rng.js';
import { S, buildSprites, hash } from './sprites.js';

buildSprites();

const SHIRT = {
  petani: '#d9a832', peramu: '#9a5fc0', penebang: '#c05a3a',
  pemancing: '#4a84c4', pedagang: '#3fae86', warga: '#8a8070', 'anak-anak': '#d8d0bc',
};
const HAIR = ['#2e2420', '#4a3522', '#6b4a2a', '#1a1a1e', '#7e3a28'];

// ============================================================
// RENDER — gaya TheoTown: ground pass → objek diurut kedalaman
// (painter's algorithm) → pencahayaan.
// ============================================================
export function render(ctx, sim, selected) {
  const w = sim.world;
  const tick = w.tick;
  const wf = Math.floor(tick / 16) % 3;
  ctx.imageSmoothingEnabled = false;

  // ---------- PASS 1: tanah ----------
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = w.tiles[y * W + x];
    const px = x * TILE, py = y * TILE;
    switch (t.type) {
      case T.WATER: {
        ctx.drawImage(S.water[wf], px, py);
        // buih di tepian
        const up = w.at(x, y - 1), dn = w.at(x, y + 1), lf = w.at(x - 1, y), rt = w.at(x + 1, y);
        if (up && up.type !== T.WATER) ctx.drawImage(S.foamN, px, py);
        if (dn && dn.type !== T.WATER) ctx.drawImage(S.foamS, px, py + TILE - 2);
        if (lf && lf.type !== T.WATER) ctx.drawImage(S.foamW, px, py);
        if (rt && rt.type !== T.WATER) ctx.drawImage(S.foamE, px + TILE - 2, py);
        break;
      }
      case T.FERTILE: ctx.drawImage(S.fertile, px, py); break;
      case T.FARM: {
        ctx.drawImage(S.farmBase, px, py);
        if (t.planted) {
          const stage = t.growth >= 100 ? 3 : t.growth > 60 ? 2 : t.growth > 25 ? 1 : 0;
          ctx.drawImage(S.wheat[stage], px, py);
        }
        break;
      }
      case T.MARKET: ctx.drawImage(S.plaza, px, py); break;
      default: {
        ctx.drawImage(S.grass[Math.floor(hash(x, y) * 4)], px, py);
        // jalan setapak organik dari lalu lintas kaki
        const tr = w.traffic[y * W + x];
        if (tr > 0.55 && t.type === T.GRASS) {
          ctx.globalAlpha = Math.min(0.9, (tr - 0.55) / 4);
          ctx.drawImage(S.path, px, py);
          ctx.globalAlpha = 1;
        }
      }
    }
  }

  // plaza di sekeliling pasar (biar kelihatan seperti alun-alun)
  const m = w.market;
  for (let dy = -1; dy <= 2; dy++) for (let dx = -1; dx <= 2; dx++) {
    const t = w.at(m.x + dx, m.y + dy);
    if (t && t.type === T.GRASS) {
      ctx.globalAlpha = 0.5;
      ctx.drawImage(S.plaza, (m.x + dx) * TILE, (m.y + dy) * TILE);
      ctx.globalAlpha = 1;
    }
  }

  // ---------- PASS 2: objek diurut kedalaman (y) ----------
  const objs = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = w.tiles[y * W + x];
    if (t.type === T.FOREST) objs.push({ y: y + 0.9, draw: () => drawTree(ctx, t, x, y) });
    else if (t.type === T.BUSH) objs.push({ y: y + 0.8, draw: () => drawBush(ctx, t, x, y) });
    else if (t.type === T.ROCK) objs.push({ y: y + 0.8, draw: () => drawRock(ctx, x, y) });
    else if (t.type === T.HOUSE) objs.push({ y: y + 0.95, draw: () => drawHouse(ctx, w, x, y, tick) });
  }
  objs.push({ y: m.y + 1.95, draw: () => drawStall(ctx, m) });
  for (const n of sim.npcs) objs.push({ y: n.y + 0.5, draw: () => drawNpc(ctx, n, tick, n === selected) });
  for (const wolf of sim.wolves) objs.push({ y: wolf.y + 0.5, draw: () => drawWolf(ctx, wolf, tick) });
  objs.sort((a, b) => a.y - b.y);

  // garis target NPC terpilih (di bawah objek)
  if (selected && selected.alive && selected.action) {
    const tx = selected.action.tx ?? selected.action.spot?.x;
    const ty = selected.action.ty ?? selected.action.spot?.y;
    if (tx !== undefined) {
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo((selected.x + 0.5) * TILE, (selected.y + 0.5) * TILE);
      ctx.lineTo((tx + 0.5) * TILE, (ty + 0.5) * TILE);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  for (const o of objs) o.draw();

  // ---------- PASS 3: atmosfer & cahaya ----------
  const h = w.hour;
  let darkness = 0;
  if (h >= 19) darkness = Math.min(0.52, ((h - 19) / 2) * 0.52);
  else if (h < 6) darkness = Math.min(0.52, ((6 - h) / 2) * 0.52);

  // semburat fajar/senja
  const dawn = (h > 5 && h < 7.5) ? 1 - Math.abs(h - 6.2) / 1.3 : 0;
  const dusk = (h > 17.5 && h < 20) ? 1 - Math.abs(h - 18.7) / 1.3 : 0;
  const warm = Math.max(dawn, dusk);
  if (warm > 0) {
    ctx.fillStyle = `rgba(232, 140, 60, ${warm * 0.16})`;
    ctx.fillRect(0, 0, W * TILE, H * TILE);
  }

  if (darkness > 0) {
    ctx.fillStyle = `rgba(14, 20, 58, ${darkness})`;
    ctx.fillRect(0, 0, W * TILE, H * TILE);
    // cahaya hangat dari rumah & pasar
    ctx.globalCompositeOperation = 'lighter';
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const t = w.tiles[y * W + x];
      if (t.type === T.HOUSE || t.type === T.MARKET) {
        const cx = x * TILE + TILE / 2, cy = y * TILE + TILE / 2;
        const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, 30);
        g.addColorStop(0, `rgba(255, 180, 70, ${darkness * 0.33})`);
        g.addColorStop(1, 'rgba(255,180,70,0)');
        ctx.fillStyle = g;
        ctx.fillRect(cx - 30, cy - 30, 60, 60);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // ring seleksi
  if (selected && selected.alive) {
    const cx = (selected.x + 0.5) * TILE, cy = (selected.y + 0.5) * TILE;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy - 4, 9 + Math.sin(tick * 0.15), 0, 7);
    ctx.stroke();
  }
}

// ====== Penggambar objek ======
function shadow(ctx, cx, cy, rw, rh = 2.5) {
  ctx.fillStyle = 'rgba(20, 30, 15, 0.28)';
  ctx.beginPath();
  ctx.ellipse(cx, cy, rw, rh, 0, 0, 7);
  ctx.fill();
}

function drawTree(ctx, t, x, y) {
  const ratio = (t.wood || 0) / (t.maxWood || 6);
  const size = ratio > 0.55 ? 0 : ratio > 0.2 ? 1 : 2;
  const v = hash(x * 3, y * 7) > 0.5 ? 1 : 0;
  shadow(ctx, x * TILE + 8, y * TILE + TILE - 2, 6);
  ctx.drawImage(S.tree[size][v], x * TILE, y * TILE - 11);
}

function drawBush(ctx, t, x, y) {
  shadow(ctx, x * TILE + 8, y * TILE + 13, 5.5, 2);
  ctx.drawImage(S.bush, x * TILE, y * TILE + 1);
  // beri matang
  const n = Math.min(5, t.berries);
  const POS = [[5, 7], [10, 6], [7, 9], [12, 9], [4, 10]];
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = '#d43d2a';
    ctx.fillRect(x * TILE + POS[i][0], y * TILE + 1 + POS[i][1], 2, 2);
    ctx.fillStyle = '#f07a5a';
    ctx.fillRect(x * TILE + POS[i][0], y * TILE + 1 + POS[i][1], 1, 1);
  }
}

function drawRock(ctx, x, y) {
  shadow(ctx, x * TILE + 8, y * TILE + 13, 5.5, 2);
  ctx.drawImage(S.rock, x * TILE, y * TILE + 2);
}

function drawHouse(ctx, w, x, y, tick) {
  shadow(ctx, x * TILE + 8, y * TILE + TILE - 1, 9, 3);
  const lit = w.isNight;
  ctx.drawImage(lit ? S.houseLit : S.house, x * TILE - 1, y * TILE - 8);
  // asap cerobong (pelan, berkedip-kedip naik)
  const phase = Math.floor(tick / 6) % 14;
  ctx.fillStyle = `rgba(200, 200, 200, ${0.5 - phase * 0.03})`;
  ctx.fillRect(x * TILE + 12 + Math.sin((tick + x * 50) * 0.04) * 1.5, y * TILE - 8 - phase, 2, 2);
}

function drawStall(ctx, m) {
  shadow(ctx, m.x * TILE + TILE, m.y * TILE + TILE * 2 - 2, 16, 3.5);
  ctx.drawImage(S.stall, m.x * TILE - 1, m.y * TILE - 2);
}

function drawNpc(ctx, n, tick, isSelected) {
  const cx = Math.round((n.x + 0.5) * TILE);
  const cy = Math.round((n.y + 0.5) * TILE);
  const kid = !n.isAdult;
  const shirt = SHIRT[n.profession] || '#8a8070';
  const hair = HAIR[n.id % HAIR.length];
  const skin = '#e8b88a';

  shadow(ctx, cx, cy + 2, kid ? 3 : 4, 1.6);

  if (n.asleep) {
    // tidur: rebahan
    ctx.fillStyle = shirt;
    ctx.fillRect(cx - 4, cy - 2, 7, 3);
    ctx.fillStyle = skin;
    ctx.fillRect(cx + 3, cy - 3, 3, 3);
    ctx.font = '8px serif';
    ctx.fillText('💤', cx - 2, cy - 6);
    return;
  }

  // animasi langkah
  const moving = n.path && n.pathIdx < (n.path?.length || 0);
  const step = moving ? Math.floor(tick / 5 + n.id) % 2 : 0;
  const bob = moving ? (Math.floor(tick / 5 + n.id) % 2) : 0;

  if (kid) {
    ctx.fillStyle = '#2e2420';
    ctx.fillRect(cx - 2 + step, cy, 1, 2);
    ctx.fillRect(cx + 1 - step, cy, 1, 2);
    ctx.fillStyle = shirt;
    ctx.fillRect(cx - 2, cy - 3 - bob, 5, 3);
    ctx.fillStyle = skin;
    ctx.fillRect(cx - 2, cy - 6 - bob, 5, 3);
    ctx.fillStyle = hair;
    ctx.fillRect(cx - 2, cy - 7 - bob, 5, 2);
  } else {
    // kaki
    ctx.fillStyle = '#3a2e22';
    ctx.fillRect(cx - 2 + step, cy, 2, 3);
    ctx.fillRect(cx + 1 - step, cy, 2, 3);
    // badan
    ctx.fillStyle = shirt;
    ctx.fillRect(cx - 3, cy - 5 - bob, 7, 5);
    // tangan
    ctx.fillStyle = skin;
    ctx.fillRect(cx - 4, cy - 4 - bob, 1, 3);
    ctx.fillRect(cx + 4, cy - 4 - bob, 1, 3);
    // kepala
    ctx.fillRect(cx - 2, cy - 10 - bob, 5, 5);
    ctx.fillStyle = hair;
    ctx.fillRect(cx - 2, cy - 11 - bob, 5, 2);
    if (n.sex === 'P') { // rambut panjang
      ctx.fillRect(cx - 3, cy - 10 - bob, 1, 4);
      ctx.fillRect(cx + 3, cy - 10 - bob, 1, 4);
    }
  }

  // ikon aksi
  if (n.action) {
    const em = ACTIONS[n.action.id]?.emoji;
    if (em && (n.action.id !== 'santai')) {
      ctx.font = '8px serif';
      ctx.fillText(em, cx - 4, cy - (kid ? 10 : 14) - bob);
    }
  }
}

function drawWolf(ctx, wolf, tick) {
  const cx = Math.round((wolf.x + 0.5) * TILE);
  const cy = Math.round((wolf.y + 0.5) * TILE);
  shadow(ctx, cx, cy + 2, 5, 1.8);
  const step = Math.floor(tick / 4) % 2;
  ctx.fillStyle = '#3e3e46';
  ctx.fillRect(cx - 5, cy - 4, 9, 4);          // badan
  ctx.fillRect(cx + 3, cy - 6, 4, 4);          // kepala
  ctx.fillRect(cx + 4, cy - 8, 1, 2);          // telinga
  ctx.fillRect(cx + 6, cy - 8, 1, 2);
  ctx.fillRect(cx - 7, cy - 6, 2, 3);          // ekor
  ctx.fillStyle = '#2e2e34';
  ctx.fillRect(cx - 4 + step, cy, 2, 2);       // kaki
  ctx.fillRect(cx + 1 - step, cy, 2, 2);
  ctx.fillStyle = '#e74c3c';
  ctx.fillRect(cx + 6, cy - 5, 1, 1);          // mata
}

export function pickNpc(sim, mx, my) {
  let best = null, bd = 1.2;
  for (const n of sim.npcs) {
    const d = dist(n.x + 0.5, n.y + 0.2, mx, my);
    if (d < bd) { bd = d; best = n; }
  }
  return best;
}
