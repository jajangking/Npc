import { clamp } from './rng.js';

// ============================================================
// PASAR — harga murni muncul dari supply & demand harian.
// Tidak ada harga yang dipatok: kalau panen melimpah harga
// anjlok, kalau musim dingin paceklik harga meroket.
// ============================================================
export class Market {
  constructor() {
    this.prices = { food: 2.0, wood: 1.5 };
    this.flow = { foodSold: 0, foodBought: 0, woodSold: 0, woodBought: 0 };
    this.stock = { food: 14, wood: 10 };
    this.history = { food: [2.0], wood: [1.5] };
  }

  trade(npc, sim) {
    let reward = 0.4;
    const p = this.prices;
    let traded = false;

    // Jual surplus makanan
    const stockCap = sim?.granary ? 260 : 120;
    const sellF = Math.max(0, npc.inv.food - 7);
    if (sellF > 0 && this.stock.food < stockCap) {
      const margin = 0.9 + npc.skills.dagang * 0.2;
      const gain = Math.round(sellF * p.food * margin * 10) / 10;
      npc.inv.food -= sellF;
      npc.inv.coins += gain;
      this.stock.food += sellF;
      this.flow.foodSold += sellF;
      npc.skills.dagang = clamp(npc.skills.dagang + 0.008, 0, 1);
      npc.thought = `menjual ${sellF} makanan, dapat ${gain} koin`;
      reward += 0.15 * sellF;
      traded = true;
    }

    // Jual surplus kayu — hanya yang sudah punya rumah SENDIRI;
    // yang masih nebeng menyimpan kayunya untuk membangun
    const sellW = (sim && npc.ownsHome(sim.world)) ? Math.max(0, npc.inv.wood - 4) : 0;
    if (sellW > 0) {
      const gain = Math.round(sellW * p.wood * (0.9 + npc.skills.dagang * 0.2) * 10) / 10;
      npc.inv.wood -= sellW;
      npc.inv.coins += gain;
      this.stock.wood += sellW;
      this.flow.woodSold += sellW;
      reward += 0.12 * sellW;
      traded = true;
    }

    // Beli makanan kalau kelaparan & mampu
    if (npc.inv.food < 3) {
      const want = Math.min(4, Math.floor(npc.inv.coins / p.food), this.stock.food);
      if (want > 0) {
        const cost = Math.round(want * p.food * 10) / 10;
        npc.inv.coins -= cost;
        npc.inv.food += want;
        this.stock.food -= want;
        this.flow.foodBought += want;
        npc.thought = `membeli ${want} makanan seharga ${cost} koin`;
        reward += 0.5;
        traded = true;
      } else if (this.stock.food <= 0) {
        npc.thought = 'pasar kehabisan makanan!';
        reward = 0.25;
      } else {
        npc.thought = 'koinnya tidak cukup untuk beli makan...';
        reward = 0.25;
      }
    }

    // Beli kayu untuk calon rumah (kalau mahal nebang sendiri, ini alternatif)
    if (sim && !npc.ownsHome(sim.world) && npc.inv.wood < 14 && npc.inv.coins > p.wood * 6 && this.stock.wood > 0) {
      const want = Math.min(5, Math.floor((npc.inv.coins * 0.5) / p.wood), this.stock.wood);
      if (want > 0) {
        const cost = Math.round(want * p.wood * 10) / 10;
        npc.inv.coins -= cost;
        npc.inv.wood += want;
        this.stock.wood -= want;
        this.flow.woodBought += want;
        reward += 0.3;
      }
    }

    // transaksi nyata menumbuhkan ilmu perdagangan desa
    if (traded && sim) sim.know.dagang += 0.3 + npc.skills.dagang * 0.3;

    return reward;
  }

  // Dipanggil tiap pergantian hari: harga menyesuaikan arus pasar
  dailyUpdate(sim) {
    for (const g of ['food', 'wood']) {
      const sold = this.flow[g + 'Sold'], bought = this.flow[g + 'Bought'];
      const pressure = (bought - sold) * 0.03 + (g === 'food' && this.stock.food < 5 ? 0.15 : 0);
      const drift = (2.0 - this.prices[g]) * 0.01; // gravitasi lemah ke baseline
      this.prices[g] = clamp(this.prices[g] * (1 + pressure) + drift, 0.5, 8);
      this.prices[g] = Math.round(this.prices[g] * 100) / 100;
      this.flow[g + 'Sold'] = 0;
      this.flow[g + 'Bought'] = 0;
      this.history[g].push(this.prices[g]);
      if (this.history[g].length > 60) this.history[g].shift();
    }
    // stok pasar membusuk — lumbung desa membuatnya jauh lebih awet
    const spoil = sim?.granary ? 0.015 : 0.06;
    this.stock.food = Math.max(0, this.stock.food - Math.ceil(this.stock.food * spoil));
  }
}
