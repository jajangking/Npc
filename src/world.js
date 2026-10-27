import { clamp } from './rng.js';

// ====== Konstanta dunia ======
export const W = 64, H = 46;
export const TILE = 16;
export const DAY = 900;                 // tick per hari
export const SEASON_DAYS = 6;           // hari per musim
export const SEASONS = ['Semi 🌸', 'Panas ☀️', 'Gugur 🍂', 'Dingin ❄️'];

export const T = {
  GRASS: 0, WATER: 1, FOREST: 2, BUSH: 3, ROCK: 4,
  FERTILE: 5, FARM: 6, HOUSE: 7, MARKET: 8,
  ROAD: 9, BRIDGE: 10, GRANARY: 11,
};

export class World {
  constructor(rng) {
    this.rng = rng;
    this.tick = 0;
    this.tiles = new Array(W * H);
    this.traffic = new Float32Array(W * H);   // jejak kaki → jalan setapak organik
    for (let i = 0; i < W * H; i++) this.tiles[i] = { type: T.GRASS };
    this.generate();
  }

  idx(x, y) { return y * W + x; }
  at(x, y) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= W || y >= H) return null;
    return this.tiles[this.idx(x, y)];
  }
  inBounds(x, y) { return x >= 0 && y >= 0 && x < W && y < H; }

  passable(x, y) {
    const t = this.at(x, y);
    if (!t) return false;
    return t.type !== T.WATER && t.type !== T.ROCK;
  }

  // biaya medan: jalan batu cepat, hutan lambat
  terrainCost(x, y) {
    const t = this.at(x, y);
    if (!t) return 1;
    if (t.type === T.ROAD) return 0.55;
    if (t.type === T.BRIDGE) return 0.85;
    if (t.type === T.FOREST) return 1.3;
    return 1;
  }

  // pengali kecepatan jalan kaki di tile ini
  speedAt(x, y, hasCart) {
    const t = this.at(x, y);
    if (!t) return 1;
    if (t.type === T.ROAD) return hasCart ? 1.8 : 1.5;
    if (t.type === T.BRIDGE) return 1.2;
    if (t.type === T.FOREST) return 0.85;
    return 1;
  }

  // ====== Waktu ======
  get day() { return Math.floor(this.tick / DAY); }
  get hour() { return ((this.tick % DAY) / DAY) * 24; }
  get isNight() { const h = this.hour; return h >= 20 || h < 5.5; }
  get seasonIdx() { return Math.floor(this.day / SEASON_DAYS) % 4; }
  get seasonName() { return SEASONS[this.seasonIdx]; }
  get isWinter() { return this.seasonIdx === 3; }

  // Pengali hasil alam per musim: semi subur, dingin paceklik
  get growthMod() { return [1.3, 1.05, 0.85, 0.28][this.seasonIdx]; }

  // ====== Pembentukan dunia ======
  generate() {
    const { rng } = this;

    // Danau
    const lx = rng.int(8, 16), ly = rng.int(28, 38);
    const lrx = rng.int(5, 8), lry = rng.int(4, 6);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const d = ((x - lx) / lrx) ** 2 + ((y - ly) / lry) ** 2;
      if (d < 1) this.tiles[this.idx(x, y)].type = T.WATER;
    }
    // Sungai berkelok dari atas ke danau
    let rx = rng.int(20, 40);
    for (let y = 0; y < ly; y++) {
      rx = clamp(rx + rng.int(-1, 1), 3, W - 4);
      this.tiles[this.idx(rx, y)].type = T.WATER;
      if (rng.chance(0.5)) this.tiles[this.idx(rx + 1, y)].type = T.WATER;
      if (y === ly - 1) {
        // sambungkan ke danau
        const step = rx < lx ? 1 : -1;
        for (let x = rx; x !== lx; x += step) this.tiles[this.idx(x, y)].type = T.WATER;
      }
    }

    // Hutan — beberapa rumpun
    const nBlob = rng.int(5, 7);
    for (let b = 0; b < nBlob; b++) {
      const cx = rng.int(4, W - 5), cy = rng.int(4, H - 5), r = rng.range(2.5, 5.5);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const d = Math.hypot(x - cx, y - cy);
        const t = this.tiles[this.idx(x, y)];
        if (d < r && t.type === T.GRASS && rng.chance(0.82)) {
          t.type = T.FOREST;
          t.wood = rng.int(4, 9);
          t.maxWood = t.wood;
        }
      }
    }

    // Semak beri — tersebar, agak dekat hutan
    let bushes = 0;
    for (let tries = 0; tries < 900 && bushes < 26; tries++) {
      const x = rng.int(1, W - 2), y = rng.int(1, H - 2);
      const t = this.tiles[this.idx(x, y)];
      if (t.type !== T.GRASS) continue;
      let nearForest = false;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const n = this.at(x + dx, y + dy);
        if (n && n.type === T.FOREST) nearForest = true;
      }
      if (nearForest || rng.chance(0.25)) {
        t.type = T.BUSH;
        t.berries = rng.int(3, 9);
        t.maxBerries = 9;
        bushes++;
      }
    }

    // Tanah subur dekat air
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const t = this.tiles[this.idx(x, y)];
      if (t.type !== T.GRASS) continue;
      let nearWater = false;
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
        const n = this.at(x + dx, y + dy);
        if (n && n.type === T.WATER) nearWater = true;
      }
      if (nearWater && rng.chance(0.3)) t.type = T.FERTILE;
    }

    // Batu
    for (let i = 0; i < 12; i++) {
      const x = rng.int(0, W - 1), y = rng.int(0, H - 1);
      const t = this.tiles[this.idx(x, y)];
      if (t.type === T.GRASS) t.type = T.ROCK;
    }

    // Pasar di tengah — plaza bersih di sekitarnya
    const mx = Math.floor(W / 2), my = Math.floor(H / 2);
    this.market = { x: mx, y: my };
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const t = this.at(mx + dx, my + dy);
      if (t && t.type !== T.WATER) t.type = T.GRASS, delete t.wood, delete t.berries;
    }
    for (let dy = 0; dy <= 1; dy++) for (let dx = 0; dx <= 1; dx++) {
      this.tiles[this.idx(mx + dx, my + dy)].type = T.MARKET;
    }
  }

  // ====== Dinamika alam per tick ======
  step() {
    this.tick++;
    // jejak kaki memudar perlahan — jalan yang tak dipakai kembali berumput
    if (this.tick % 600 === 0) {
      for (let i = 0; i < this.traffic.length; i++) this.traffic[i] *= 0.965;
    }
    // regrowth: tiap semak/hutan dicek tiap tick dengan peluang kecil
    if (!this.bushList) {
      this.bushList = this.tiles.filter(t => t.type === T.BUSH);
      this.forestList = this.tiles.filter(t => t.type === T.FOREST);
    }
    for (const t of this.bushList) {
      if (t.type === T.BUSH && t.berries < t.maxBerries) {
        if (this.rng.chance(0.005 * this.growthMod)) t.berries++;
      }
    }
    for (const t of this.forestList) {
      if (t.type === T.FOREST && t.wood < t.maxWood) {
        if (this.rng.chance(0.0012 * this.growthMod)) t.wood++;
      }
    }
    // pertumbuhan ladang (per tick, murah karena jumlah farm kecil)
    if (!this.farmList) this.farmList = [];
    for (const f of this.farmList) {
      if (f.type === T.FARM && f.planted && f.growth < 100) {
        f.growth += 0.058 * this.growthMod;
      }
    }
  }

  registerFarm(tile) {
    if (!this.farmList) this.farmList = [];
    if (!this.farmList.includes(tile)) this.farmList.push(tile);
  }

  tread(x, y) {
    x = Math.round(x); y = Math.round(y);
    if (!this.inBounds(x, y)) return;
    const i = y * W + x;
    this.traffic[i] = Math.min(9, this.traffic[i] + 0.012);
  }

  // ====== A* pathfinding (grid kecil, murah) ======
  findPath(sx, sy, tx, ty) {
    sx = Math.round(sx); sy = Math.round(sy);
    tx = Math.round(tx); ty = Math.round(ty);
    // target tidak bisa diinjak → cari tetangga terdekat yang bisa
    if (!this.inBounds(tx, ty) || !this.passable(tx, ty)) {
      let found = null;
      outer:
      for (let r = 1; r <= 3; r++) {
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (this.passable(tx + dx, ty + dy)) { found = [tx + dx, ty + dy]; break outer; }
        }
      }
      if (!found) return null;
      [tx, ty] = found;
    }
    if (!this.passable(sx, sy)) {
      for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        if (this.passable(sx + dx, sy + dy)) { sx += dx; sy += dy; break; }
      }
    }
    if (sx === tx && sy === ty) return [[tx, ty]];

    const N = W * H;
    const gScore = new Float32Array(N).fill(Infinity);
    const prev = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const sIdx = sy * W + sx, tIdx = ty * W + tx;
    gScore[sIdx] = 0;
    // binary heap [f, idx]
    const heap = [[Math.hypot(tx - sx, ty - sy), sIdx]];
    const push = (item) => {
      heap.push(item);
      let i = heap.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (heap[p][0] <= heap[i][0]) break;
        [heap[p], heap[i]] = [heap[i], heap[p]]; i = p;
      }
    };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1, r = l + 1;
          let m = i;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]]; i = m;
        }
      }
      return top;
    };
    const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
      [1, 1, 1.42], [1, -1, 1.42], [-1, 1, 1.42], [-1, -1, 1.42]];
    let guard = 0;
    while (heap.length && guard++ < 6000) {
      const [, cur] = pop();
      if (closed[cur]) continue;
      closed[cur] = 1;
      if (cur === tIdx) {
        const path = [];
        let c = cur;
        while (c !== -1) { path.push([c % W, Math.floor(c / W)]); c = prev[c]; }
        return path.reverse();
      }
      const cx = cur % W, cy = Math.floor(cur / W);
      for (const [dx, dy, cost] of DIRS) {
        const nx = cx + dx, ny = cy + dy;
        if (!this.inBounds(nx, ny) || !this.passable(nx, ny)) continue;
        if (dx && dy && (!this.passable(cx + dx, cy) || !this.passable(cx, cy + dy))) continue; // jangan motong sudut
        const ni = ny * W + nx;
        if (closed[ni]) continue;
        const ng = gScore[cur] + cost * this.terrainCost(nx, ny);
        if (ng < gScore[ni]) {
          gScore[ni] = ng;
          prev[ni] = cur;
          push([ng + Math.hypot(tx - nx, ty - ny), ni]);
        }
      }
    }
    return null; // tidak terjangkau
  }

  findNearest(x, y, pred, maxR = 50) {
    let best = null, bd = Infinity;
    for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
      const t = this.tiles[this.idx(tx, ty)];
      if (!pred(t, tx, ty)) continue;
      const d = Math.hypot(tx - x, ty - y);
      if (d < bd && d <= maxR) { bd = d; best = { t, x: tx, y: ty }; }
    }
    return best;
  }
}
