import { W, H, TILE, T } from './world.js';
import { ACTIONS } from './actions.js';
import { dist } from './rng.js';
import { S, buildSprites, hash, IW, IH } from './sprites.js';

buildSprites();

// ====== Proyeksi isometrik (TheoTown-style) ======
export const OX = (H - 1) * (IW / 2);
export const OY = 52;
export const CANVAS_W = (W + H) * (IW / 2);
export const CANVAS_H = (W + H - 1) * (IH / 2) + IH + OY + 10;

export const isoX = (x, y) => (x - y) * (IW / 2) + OX;
export const isoY = (x, y) => (x + y) * (IH / 2) + OY;

export function screenToWorld(mx, my) {
  const u = (mx - OX - IW / 2) / (IW / 2);
  const v = (my - OY - IH / 2) / (IH / 2);
  return { x: (u + v) / 2, y: (v - u) / 2 };
}

const SHIRT = {
  petani: '#d9a832', peramu: '#9a5fc0', penebang: '#c05a3a',
  pemancing: '#4a84c4', pedagang: '#3fae86', warga: '#8a8070', 'anak-anak': '#d8d0bc',
};
const HAIR = ['#2e2420', '#4a3522', '#6b4a2a', '#1a1a1e', '#7e3a28'];

export function render(ctx, sim, selected) {
  const w = sim.world;
  const tick = w.tick;
  const wf = Math.floor(tick / 16) % 3;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#11100c';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // ---------- PASS 1: tanah ----------
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = w.tiles[y * W + x];
    const sx = isoX(x, y), sy = isoY(x, y);
    switch (t.type) {
      case T.WATER: ctx.drawImage(S.water[wf], sx, sy); break;
      case T.FERTILE: ctx.drawImage(S.fertile, sx, sy); break;
      case T.FARM: ctx.drawImage(S.farmBase, sx, sy); break;
      case T.MARKET: case T.PLAZA: ctx.drawImage(S.plaza, sx, sy); break;
      case T.ROAD: ctx.drawImage(S.road, sx, sy); break;
      case T.BRIDGE: ctx.drawImage(S.bridge, sx, sy); break;
      case T.PARK: ctx.drawImage(S.park, sx, sy); break;
      case T.PIER: ctx.drawImage(S.pier, sx, sy); break;
      default: {
        ctx.drawImage(S.grass[Math.floor(hash(x, y) * 4)], sx, sy);
        const tr = w.traffic[y * W + x];
        if (tr > 2.2 && t.type === T.GRASS) {
          ctx.globalAlpha = Math.min(0.55, (tr - 2.2) / 9);
          ctx.drawImage(S.path, sx, sy);
          ctx.globalAlpha = 1;
        }
      }
    }
  }

  // plaza lembut di sekitar pasar
  const m = w.market;
  for (let dy = -1; dy <= 2; dy++) for (let dx = -1; dx <= 2; dx++) {
    const t = w.at(m.x + dx, m.y + dy);
    if (t && t.type === T.GRASS) {
      ctx.globalAlpha = 0.45;
      ctx.drawImage(S.plaza, isoX(m.x + dx, m.y + dy), isoY(m.x + dx, m.y + dy));
      ctx.globalAlpha = 1;
    }
  }

  // ---------- PASS 2: objek diurut kedalaman (x + y) ----------
  const objs = [];
  const put = (x, y, fn) => objs.push({ d: x + y, fn });

  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = w.tiles[y * W + x];
    const sx = isoX(x, y), sy = isoY(x, y);
    switch (t.type) {
      case T.FOREST: {
        const ratio = (t.wood || 0) / (t.maxWood || 6);
        const size = ratio > 0.55 ? 0 : ratio > 0.2 ? 1 : 2;
        put(x, y, () => { shadowE(ctx, sx + 16, sy + 10, 9, 4); ctx.drawImage(S.tree[size], sx, sy - 26); });
        break;
      }
      case T.BUSH:
        put(x, y, () => {
          shadowE(ctx, sx + 16, sy + 12, 8, 3.5);
          ctx.drawImage(S.bush, sx, sy - 4);
          const n = Math.min(5, t.berries);
          const POS = [[12, 5], [18, 3], [15, 8], [21, 7], [10, 8]];
          for (let i = 0; i < n; i++) {
            ctx.fillStyle = '#d43d2a';
            ctx.fillRect(sx + POS[i][0], sy - 4 + POS[i][1], 2, 2);
          }
        });
        break;
      case T.ROCK: put(x, y, () => ctx.drawImage(S.rock, sx, sy - 4)); break;
      case T.FARM:
        if (t.planted) {
          const stage = t.growth >= 100 ? 3 : t.growth > 60 ? 2 : t.growth > 25 ? 1 : 0;
          put(x, y, () => ctx.drawImage(S.wheat[stage], sx, sy - 10));
        }
        break;
      case T.HOUSE: {
        const big = t.level === 2;
        const spr = w.isNight ? (big ? S.house2Lit : S.houseLit) : (big ? S.house2 : S.house);
        put(x, y, () => { shadowE(ctx, sx + 16, sy + 10, 13, 5); ctx.drawImage(spr, sx, sy - (spr.height - IH)); drawSmoke(ctx, sx + 16, sy - (spr.height - IH), tick, x); });
        break;
      }
      case T.MARKET:
        if (x === m.x && y === m.y) {
          put(x, y, () => { shadowE(ctx, sx + 16, sy + 10, 14, 5); ctx.drawImage(S.market, sx, sy - (S.market.height - IH)); });
        }
        break;
      case T.GRANARY: put(x, y, () => { shadowE(ctx, sx + 16, sy + 10, 14, 5); ctx.drawImage(S.granary, sx, sy - (S.granary.height - IH)); }); break;
      case T.WARUNG: put(x, y, () => { shadowE(ctx, sx + 16, sy + 10, 12, 4.5); ctx.drawImage(S.warung, sx, sy - (S.warung.height - IH)); }); break;
      case T.KEDAI: put(x, y, () => { shadowE(ctx, sx + 16, sy + 10, 12, 4.5); ctx.drawImage(S.kedai, sx, sy - (S.kedai.height - IH)); }); break;
      case T.SCHOOL: put(x, y, () => { shadowE(ctx, sx + 16, sy + 10, 13, 5); ctx.drawImage(S.school, sx, sy - (S.school.height - IH)); }); break;
      case T.HALL: put(x, y, () => { shadowE(ctx, sx + 16, sy + 10, 14, 5); ctx.drawImage(S.hall, sx, sy - (S.hall.height - IH)); }); break;
      case T.PENDOPO: put(x, y, () => { shadowE(ctx, sx + 16, sy + 10, 14, 5); ctx.drawImage(S.pendopo, sx, sy - (S.pendopo.height - IH)); }); break;
      case T.ROAD:
        if (t.lamp) put(x, y, () => ctx.drawImage(S.lamp, sx + 11, sy - 14));
        break;
    }
  }

  if (sim.park) {
    const bx = isoX(sim.park.x, sim.park.y), by = isoY(sim.park.x, sim.park.y);
    put(sim.park.x, sim.park.y, () => ctx.drawImage(S.bench, bx + 10, by - 2));
  }

  for (const n of sim.npcs) put(n.x + 0.3, n.y + 0.3, () => drawNpc(ctx, n, tick));
  for (const wolf of sim.wolves) put(wolf.x + 0.3, wolf.y + 0.3, () => drawWolf(ctx, wolf, tick));

  if (sim.festivalActive) put(m.x + 1, m.y - 1, () => drawFestival(ctx, m, tick));

  objs.sort((a, b) => a.d - b.d);

  // garis target NPC terpilih
  if (selected && selected.alive && selected.action) {
    const tx = selected.action.tx ?? selected.action.spot?.x;
    const ty = selected.action.ty ?? selected.action.spot?.y;
    if (tx !== undefined) {
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(isoX(selected.x, selected.y) + 16, isoY(selected.x, selected.y) + 8);
      ctx.lineTo(isoX(tx, ty) + 16, isoY(tx, ty) + 8);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  for (const o of objs) o.fn();

  // ---------- PASS 3: atmosfer & cahaya ----------
  const h = w.hour;
  let darkness = 0;
  if (h >= 19) darkness = Math.min(0.52, ((h - 19) / 2) * 0.52);
  else if (h < 6) darkness = Math.min(0.52, ((6 - h) / 2) * 0.52);

  const dawn = (h > 5 && h < 7.5) ? 1 - Math.abs(h - 6.2) / 1.3 : 0;
  const dusk = (h > 17.5 && h < 20) ? 1 - Math.abs(h - 18.7) / 1.3 : 0;
  const warm = Math.max(dawn, dusk);
  if (warm > 0) {
    ctx.fillStyle = `rgba(232, 140, 60, ${warm * 0.16})`;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }

  if (darkness > 0) {
    ctx.fillStyle = `rgba(14, 20, 58, ${darkness})`;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.globalCompositeOperation = 'lighter';
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const t = w.tiles[y * W + x];
      const isLamp = t.type === T.ROAD && t.lamp;
      const glow = t.type === T.HOUSE || t.type === T.MARKET || t.type === T.GRANARY ||
        t.type === T.WARUNG || t.type === T.KEDAI || t.type === T.SCHOOL ||
        t.type === T.HALL || t.type === T.PENDOPO || isLamp;
      if (!glow) continue;
      const cx = isoX(x, y) + 16, cy = isoY(x, y) + 4 - (isLamp ? 8 : 0);
      const rad = isLamp ? 42 : 34;
      const str = isLamp ? 0.45 : 0.3;
      const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, rad);
      g.addColorStop(0, `rgba(255, 190, 80, ${darkness * str})`);
      g.addColorStop(1, 'rgba(255,190,80,0)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // ring seleksi (elips iso)
  if (selected && selected.alive) {
    const cx = isoX(selected.x, selected.y) + 16, cy = isoY(selected.x, selected.y) + 10;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 11 + Math.sin(tick * 0.15), 5.5 + Math.sin(tick * 0.15) * 0.5, 0, 0, 7);
    ctx.stroke();
  }
}

// ====== penggambar kecil ======
function shadowE(ctx, cx, cy, rw, rh) {
  ctx.fillStyle = 'rgba(20, 30, 15, 0.25)';
  ctx.beginPath();
  ctx.ellipse(cx, cy, rw, rh, 0, 0, 7);
  ctx.fill();
}

function drawSmoke(ctx, cx, topY, tick, seed) {
  const phase = Math.floor(tick / 6) % 14;
  ctx.fillStyle = `rgba(200, 200, 200, ${0.45 - phase * 0.03})`;
  ctx.fillRect(cx + 4 + Math.sin((tick + seed * 50) * 0.04) * 1.5, topY - phase, 2, 2);
}

function drawNpc(ctx, n, tick) {
  const cx = Math.round(isoX(n.x, n.y) + 16);
  const cy = Math.round(isoY(n.x, n.y) + 10);
  const kid = !n.isAdult;
  const shirt = SHIRT[n.profession] || '#8a8070';
  const hair = HAIR[n.id % HAIR.length];
  const skin = '#e8b88a';

  shadowE(ctx, cx, cy + 1, kid ? 3.5 : 4.5, 2);

  if (n.asleep) {
    ctx.fillStyle = shirt;
    ctx.fillRect(cx - 4, cy - 3, 8, 3);
    ctx.fillStyle = skin;
    ctx.fillRect(cx + 3, cy - 4, 3, 3);
    ctx.font = '8px serif';
    ctx.fillText('💤', cx - 2, cy - 7);
    return;
  }

  const moving = n.path && n.pathIdx < (n.path?.length || 0);
  const step = moving ? Math.floor(tick / 5 + n.id) % 2 : 0;
  const bob = moving ? (Math.floor(tick / 5 + n.id) % 2) : 0;

  if (n.cart && !kid) {
    ctx.fillStyle = '#8a6b42';
    ctx.fillRect(cx - 12, cy - 6, 7, 4);
    ctx.fillStyle = '#4a3b28';
    ctx.fillRect(cx - 10 + step, cy - 2, 2, 2);
    ctx.fillStyle = '#6b4a2a';
    ctx.fillRect(cx - 5, cy - 4, 3, 1);
  }

  if (kid) {
    ctx.fillStyle = '#2e2420';
    ctx.fillRect(cx - 2 + step, cy - 1, 1, 2);
    ctx.fillRect(cx + 1 - step, cy - 1, 1, 2);
    ctx.fillStyle = shirt;
    ctx.fillRect(cx - 2, cy - 4 - bob, 5, 3);
    ctx.fillStyle = skin;
    ctx.fillRect(cx - 2, cy - 7 - bob, 5, 3);
    ctx.fillStyle = hair;
    ctx.fillRect(cx - 2, cy - 8 - bob, 5, 2);
  } else {
    ctx.fillStyle = '#3a2e22';
    ctx.fillRect(cx - 2 + step, cy - 1, 2, 3);
    ctx.fillRect(cx + 1 - step, cy - 1, 2, 3);
    ctx.fillStyle = shirt;
    ctx.fillRect(cx - 3, cy - 6 - bob, 7, 5);
    ctx.fillStyle = skin;
    ctx.fillRect(cx - 4, cy - 5 - bob, 1, 3);
    ctx.fillRect(cx + 4, cy - 5 - bob, 1, 3);
    ctx.fillRect(cx - 2, cy - 11 - bob, 5, 5);
    ctx.fillStyle = hair;
    ctx.fillRect(cx - 2, cy - 12 - bob, 5, 2);
    if (n.sex === 'P') {
      ctx.fillRect(cx - 3, cy - 11 - bob, 1, 4);
      ctx.fillRect(cx + 3, cy - 11 - bob, 1, 4);
    }
  }

  if (n.action) {
    const em = ACTIONS[n.action.id]?.emoji;
    if (em && n.action.id !== 'santai') {
      ctx.font = '8px serif';
      ctx.fillText(em, cx - 4, cy - (kid ? 11 : 15) - bob);
    }
  }
}

function drawWolf(ctx, wolf, tick) {
  const cx = Math.round(isoX(wolf.x, wolf.y) + 16);
  const cy = Math.round(isoY(wolf.x, wolf.y) + 10);
  shadowE(ctx, cx, cy + 1, 5.5, 2.2);
  const step = Math.floor(tick / 4) % 2;
  ctx.fillStyle = '#3e3e46';
  ctx.fillRect(cx - 5, cy - 5, 9, 4);
  ctx.fillRect(cx + 3, cy - 7, 4, 4);
  ctx.fillRect(cx + 4, cy - 9, 1, 2);
  ctx.fillRect(cx + 6, cy - 9, 1, 2);
  ctx.fillRect(cx - 7, cy - 7, 2, 3);
  ctx.fillStyle = '#2e2e34';
  ctx.fillRect(cx - 4 + step, cy - 1, 2, 2);
  ctx.fillRect(cx + 1 - step, cy - 1, 2, 2);
  ctx.fillStyle = '#e74c3c';
  ctx.fillRect(cx + 6, cy - 6, 1, 1);
}

function drawFestival(ctx, m, tick) {
  const x0 = isoX(m.x - 2, m.y) + 16, y0 = isoY(m.x - 2, m.y) - 18;
  const x1 = isoX(m.x + 3, m.y) + 16, y1 = isoY(m.x + 3, m.y) - 18;
  ctx.fillStyle = '#6b4a2a';
  ctx.fillRect(x0, y0, 2, 28);
  ctx.fillRect(x1, y1, 2, 28);
  const COLS = ['#e74c3c', '#e8c84a', '#4a84c4', '#3fae86', '#d46a9e', '#e8923a'];
  ctx.strokeStyle = 'rgba(60,45,30,0.8)';
  ctx.beginPath();
  ctx.moveTo(x0 + 1, y0 + 2);
  ctx.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 + 12, x1 + 1, y1 + 2);
  ctx.stroke();
  const n = 8;
  for (let i = 1; i < n; i++) {
    const tp = i / n;
    const fx = x0 + (x1 - x0) * tp;
    const fy = y0 + (y1 - y0) * tp + Math.sin(tp * Math.PI) * 9 + Math.sin(tick * 0.1 + i) * 0.8;
    ctx.fillStyle = COLS[i % COLS.length];
    ctx.beginPath();
    ctx.moveTo(fx - 2, fy); ctx.lineTo(fx + 2, fy); ctx.lineTo(fx, fy + 5);
    ctx.fill();
  }
}

export function pickNpc(sim, wx, wy) {
  let best = null, bd = 1.3;
  for (const n of sim.npcs) {
    const d = dist(n.x, n.y, wx, wy);
    if (d < bd) { bd = d; best = n; }
  }
  return best;
}
