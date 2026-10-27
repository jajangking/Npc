import { W, H, TILE, T } from './world.js';
import { ACTIONS } from './actions.js';
import { dist } from './rng.js';

const PROF_COLOR = {
  petani: '#e8c84a', peramu: '#c07be0', penebang: '#d9704f',
  pemancing: '#6fa8d6', pedagang: '#5fd6a8', warga: '#d8d0bc', 'anak-anak': '#fff',
};

export function render(ctx, sim, selected) {
  const w = sim.world;
  ctx.clearRect(0, 0, W * TILE, H * TILE);

  // ---- tiles ----
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = w.tiles[y * W + x];
    const px = x * TILE, py = y * TILE;
    switch (t.type) {
      case T.GRASS:
        ctx.fillStyle = (x + y) % 2 ? '#6f9e52' : '#74a356';
        ctx.fillRect(px, py, TILE, TILE);
        break;
      case T.WATER:
        ctx.fillStyle = (x * 3 + y + (w.tick >> 5)) % 4 ? '#4a7fb5' : '#5b90c6';
        ctx.fillRect(px, py, TILE, TILE);
        break;
      case T.FOREST: {
        ctx.fillStyle = '#5d8a45';
        ctx.fillRect(px, py, TILE, TILE);
        const density = Math.min(1, (t.wood || 0) / (t.maxWood || 6));
        ctx.fillStyle = '#2e5c2a';
        ctx.beginPath();
        ctx.moveTo(px + TILE / 2, py + 1 + (1 - density) * 3);
        ctx.lineTo(px + 2, py + TILE - 2);
        ctx.lineTo(px + TILE - 2, py + TILE - 2);
        ctx.fill();
        break;
      }
      case T.BUSH: {
        ctx.fillStyle = '#6f9e52';
        ctx.fillRect(px, py, TILE, TILE);
        ctx.fillStyle = '#3f7a38';
        ctx.beginPath();
        ctx.arc(px + TILE / 2, py + TILE / 2 + 1, TILE / 2.6, 0, 7);
        ctx.fill();
        if (t.berries > 0) {
          ctx.fillStyle = '#c0392b';
          const n = Math.min(4, t.berries);
          for (let i = 0; i < n; i++) {
            ctx.fillRect(px + 3 + (i % 2) * 5, py + 4 + Math.floor(i / 2) * 4, 2, 2);
          }
        }
        break;
      }
      case T.ROCK:
        ctx.fillStyle = '#6f9e52'; ctx.fillRect(px, py, TILE, TILE);
        ctx.fillStyle = '#8a8578';
        ctx.beginPath();
        ctx.moveTo(px + 2, py + TILE - 2); ctx.lineTo(px + TILE / 2, py + 2);
        ctx.lineTo(px + TILE - 2, py + TILE - 2); ctx.fill();
        break;
      case T.FERTILE:
        ctx.fillStyle = '#8a6f42';
        ctx.fillRect(px, py, TILE, TILE);
        ctx.fillStyle = '#7a6238';
        ctx.fillRect(px + 2, py + 2, TILE - 4, TILE - 4);
        break;
      case T.FARM: {
        ctx.fillStyle = '#7a5c32';
        ctx.fillRect(px, py, TILE, TILE);
        if (t.planted) {
          const g = Math.min(1, t.growth / 100);
          ctx.fillStyle = g >= 1 ? '#e8c84a' : `rgb(${120 + g * 110},${160 + g * 30},60)`;
          for (let i = 0; i < 3; i++) {
            const hgt = 2 + g * 7;
            ctx.fillRect(px + 2 + i * 4, py + TILE - 2 - hgt, 2, hgt);
          }
        } else {
          ctx.strokeStyle = '#6b5130';
          for (let i = 0; i < 3; i++) {
            ctx.beginPath(); ctx.moveTo(px, py + 3 + i * 4); ctx.lineTo(px + TILE, py + 3 + i * 4); ctx.stroke();
          }
        }
        break;
      }
      case T.HOUSE:
        ctx.fillStyle = '#6f9e52'; ctx.fillRect(px, py, TILE, TILE);
        ctx.fillStyle = '#8a5a35';
        ctx.fillRect(px + 2, py + 5, TILE - 4, TILE - 6);
        ctx.fillStyle = '#a33b2e';
        ctx.beginPath();
        ctx.moveTo(px, py + 6); ctx.lineTo(px + TILE / 2, py); ctx.lineTo(px + TILE, py + 6);
        ctx.fill();
        break;
      case T.MARKET:
        ctx.fillStyle = '#c9a86a';
        ctx.fillRect(px, py, TILE, TILE);
        ctx.fillStyle = '#a33b2e';
        ctx.fillRect(px + 1, py + 1, TILE - 2, 3);
        break;
    }
  }

  // ---- serigala ----
  for (const wolf of sim.wolves) {
    const px = wolf.x * TILE, py = wolf.y * TILE;
    ctx.fillStyle = '#3a3a42';
    ctx.beginPath();
    ctx.moveTo(px, py - 5); ctx.lineTo(px - 5, py + 4); ctx.lineTo(px + 5, py + 4);
    ctx.fill();
    ctx.fillStyle = '#e74c3c';
    ctx.fillRect(px - 2, py - 1, 1.5, 1.5);
    ctx.fillRect(px + 1, py - 1, 1.5, 1.5);
  }

  // ---- NPC ----
  for (const n of sim.npcs) {
    const px = n.x * TILE + TILE / 2 - 6, py = n.y * TILE + TILE / 2 - 6;
    const r = n.isAdult ? 4 : 2.6;
    const col = PROF_COLOR[n.profession] || '#fff';

    if (n === selected) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(px, py, r + 3, 0, 7); ctx.stroke();
      // garis ke target aksi
      if (n.action && (n.action.tx !== undefined || n.action.spot)) {
        const tx = n.action.tx ?? n.action.spot?.x, ty = n.action.ty ?? n.action.spot?.y;
        if (tx !== undefined) {
          ctx.strokeStyle = 'rgba(255,255,255,0.35)';
          ctx.setLineDash([3, 3]);
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(tx * TILE + TILE / 2, ty * TILE + TILE / 2); ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }

    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath(); ctx.arc(px, py, r + 1, 0, 7); ctx.fill();
    ctx.fillStyle = n.asleep ? shade(col) : col;
    ctx.beginPath(); ctx.arc(px, py, r, 0, 7); ctx.fill();

    // emoji aksi di atas kepala
    if (n.action && !n.asleep) {
      const em = ACTIONS[n.action.id]?.emoji;
      if (em) { ctx.font = '8px serif'; ctx.fillText(em, px - 4, py - r - 3); }
    }
    if (n.asleep) { ctx.font = '8px serif'; ctx.fillText('💤', px - 4, py - r - 3); }
  }

  // ---- overlay malam ----
  const h = w.hour;
  let darkness = 0;
  if (h >= 19) darkness = Math.min(0.5, (h - 19) / 2 * 0.5);
  else if (h < 6) darkness = Math.min(0.5, (6 - h) / 2 * 0.5);
  if (darkness > 0) {
    ctx.fillStyle = `rgba(12, 18, 58, ${darkness})`;
    ctx.fillRect(0, 0, W * TILE, H * TILE);
    // cahaya rumah & pasar
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const t = w.tiles[y * W + x];
      if (t.type === T.HOUSE || t.type === T.MARKET) {
        const g = ctx.createRadialGradient(x * TILE + 6, y * TILE + 6, 2, x * TILE + 6, y * TILE + 6, 26);
        g.addColorStop(0, `rgba(255, 200, 90, ${darkness * 0.5})`);
        g.addColorStop(1, 'rgba(255,200,90,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x * TILE - 22, y * TILE - 22, 56, 56);
      }
    }
  }
}

function shade(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgb(${r * 0.55 | 0},${g * 0.55 | 0},${b * 0.55 | 0})`;
}

export function pickNpc(sim, mx, my) {
  let best = null, bd = 1.2;
  for (const n of sim.npcs) {
    const d = dist(n.x + 0.5 - 6 / TILE, n.y + 0.5 - 6 / TILE, mx, my);
    if (d < bd) { bd = d; best = n; }
  }
  return best;
}
