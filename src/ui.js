import { ACTIONS } from './actions.js';
import { MEME_POOL } from './social.js';
import { TECHS, eraName } from './tech.js';

const NEED_LABEL = { hunger: 'Kenyang', energy: 'Energi', social: 'Sosial', senang: 'Senang' };
const TRAIT_LABEL = { rajin: 'Rajin', supel: 'Supel', berani: 'Berani', penasaran: 'Penasaran' };
const SKILL_LABEL = { tani: 'Bertani', ramu: 'Meramu', kayu: 'Menebang', pancing: 'Memancing', dagang: 'Dagang', pesona: 'Pesona' };
const ACTION_LABEL = {
  makan: 'Makan', tidur: 'Tidur', ramu: 'Meramu beri', pancing: 'Memancing', tani: 'Bertani',
  kayu: 'Menebang kayu', bangun: 'Membangun rumah', sosial: 'Bersosialisasi', dagang: 'Berdagang',
  cinta: 'Mendekati pujaan', jelajah: 'Menjelajah', santai: 'Bersantai', kabur: 'KABUR!',
  bangunJalan: 'Memasang jalan batu', bangunJembatan: 'Membangun jembatan', buatGerobak: 'Merakit gerobak',
  bangunLumbung: 'Membangun lumbung', upgradeRumah: 'Memperbesar rumah', pasangLampu: 'Memasang lampu jalan',
  bukaWarung: 'Membuka warung', jagaWarung: 'Mengurus warung', makanWarung: 'Jajan di warung',
  bukaKedai: 'Membuka kedai', nongkrong: 'Nongkrong di kedai', bangunTaman: 'Membangun taman',
  bangunDermaga: 'Membangun dermaga', piknik: 'Piknik / wisata', main: 'Bermain', festival: 'Berpesta festival!',
};

function esc(s) { return String(s).replace(/</g, '&lt;'); }

function bar(label, v, color) {
  const pct = Math.round(v);
  return `<div class="bar-row"><span class="lbl">${label}</span>
    <div class="bar"><div class="fill" style="width:${pct}%;background:${color}"></div></div>
    <span class="val">${pct}</span></div>`;
}

export function renderInspector(el, sim, npc) {
  if (!npc || !npc.alive) {
    el.innerHTML = `<div class="hint">👆 Klik NPC di peta untuk melihat isi kepalanya: kebutuhan, memori, pelajaran hidup, relasi, dan budayanya.</div>`;
    return;
  }
  const a = npc.action ? `${ACTIONS[npc.action.id]?.emoji || ''} ${ACTION_LABEL[npc.action.id] || npc.action.id}` : '—';
  const partner = npc.partner ? `💞 ${esc(npc.partner.name)}` : 'lajang';
  const home = npc.home ? '🏠 punya rumah' : 'tunawisma';
  const farm = npc.farm ? '🌾 punya ladang' : '';

  let html = `
    <h2>${esc(npc.name)} ${esc(npc.surname)}</h2>
    <div class="subtitle">${npc.sex === 'L' ? '♂' : '♀'} ${npc.age} tahun · <b>${npc.profession}</b> · ${partner} · ${home} ${farm}</div>
    <div class="thought">💭 "${esc(npc.thought)}"</div>
    <div class="subtitle">Sedang: <b>${a}</b></div>

    <h4>Kebutuhan</h4>`;
  const colors = { hunger: '#d9704f', energy: '#e8c84a', social: '#6fa8d6', senang: '#d46a9e' };
  for (const k of Object.keys(npc.needs)) html += bar(NEED_LABEL[k], npc.needs[k], colors[k]);

  html += `<h4>Sifat (diwariskan + mutasi)</h4>`;
  for (const k of Object.keys(npc.traits)) html += bar(TRAIT_LABEL[k], npc.traits[k] * 100, '#9a8f74');

  html += `<h4>Keahlian (tumbuh dari pengalaman)</h4>`;
  for (const k of Object.keys(npc.skills)) {
    if (npc.skills[k] > 0.12) html += bar(SKILL_LABEL[k], npc.skills[k] * 100, '#8fbf6a');
  }

  html += `<h4>Harta</h4>
    <div class="tagline">
      <span class="tag">🍖 ${Math.round(npc.inv.food)} makanan</span>
      <span class="tag">🪵 ${Math.round(npc.inv.wood)} kayu</span>
      <span class="tag">🪙 ${Math.round(npc.inv.coins * 10) / 10} koin</span>
      ${npc.cart ? '<span class="tag">🛞 gerobak</span>' : ''}
      ${sim.npcWarung(npc) ? '<span class="tag">🍜 pemilik warung</span>' : ''}
      ${sim.kedai && sim.kedai.owner === npc.id ? '<span class="tag">🍵 pemilik kedai</span>' : ''}
    </div>`;

  // Pelajaran hidup (nilai Q)
  const qs = Object.entries(npc.q).sort((x, y) => y[1] - x[1]);
  if (qs.length) {
    html += `<h4>Pelajaran hidup (nilai pengalaman per aksi)</h4><ul class="plain">`;
    for (const [id, v] of qs.slice(0, 5)) {
      const verdict = v > 1.25 ? '<span class="pos">menguntungkan</span>' : v < 0.7 ? '<span class="neg">sering gagal</span>' : 'biasa saja';
      html += `<li><b>${ACTION_LABEL[id] || id}</b>: ${v.toFixed(2)} — ${verdict}</li>`;
    }
    html += `</ul>`;
  }

  // Memori lokasi
  const spots = npc.spots.filter(s => s.est > 0.3);
  const kindName = { bush: '🫐 semak', wood: '🌲 hutan', fish: '🎣 spot ikan', fertile: '🟤 tanah subur' };
  html += `<h4>Peta mental (${spots.length} lokasi diketahui)</h4><div class="tagline">`;
  const byKind = {};
  for (const s of spots) byKind[s.kind] = (byKind[s.kind] || 0) + 1;
  for (const [k, c] of Object.entries(byKind)) html += `<span class="tag">${kindName[k]} ×${c}</span>`;
  html += `</div>`;

  if (npc.dangers.length) {
    html += `<h4>Trauma lokasi</h4><ul class="plain">`;
    for (const d of npc.dangers.slice(0, 4)) {
      html += `<li class="neg">⚠️ takut area (${Math.round(d.x)}, ${Math.round(d.y)}) — intensitas ${d.mag.toFixed(1)}</li>`;
    }
    html += `</ul>`;
  }

  // Relasi
  const rel = [...npc.opinions.entries()]
    .map(([id, o]) => ({ o, n: sim.npcs.find(x => x.id === id) }))
    .filter(r => r.n && Math.abs(r.o.aff) > 8)
    .sort((a, b) => b.o.aff - a.o.aff);
  if (rel.length) {
    html += `<h4>Relasi</h4><ul class="plain">`;
    for (const r of rel.slice(0, 6)) {
      const cls = r.o.aff > 0 ? 'pos' : 'neg';
      const label = r.o.aff > 60 ? 'sahabat' : r.o.aff > 25 ? 'teman' : r.o.aff > 0 ? 'kenalan baik' : r.o.aff > -30 ? 'kurang suka' : 'musuh';
      html += `<li><b>${esc(r.n.name)}</b> — <span class="${cls}">${label} (${Math.round(r.o.aff)})</span></li>`;
    }
    html += `</ul>`;
  }

  // Budaya
  if (npc.memes.size) {
    html += `<h4>Budaya yang dianut</h4><div class="tagline">`;
    for (const m of npc.memes) {
      const def = MEME_POOL.find(x => x.id === m);
      if (def) html += `<span class="tag meme">${def.emoji} ${def.name}</span>`;
    }
    html += `</div>`;
  }

  // Riwayat hidup
  if (npc.lifeEvents.length) {
    html += `<h4>Riwayat hidup</h4><ul class="plain">`;
    for (const e of [...npc.lifeEvents].reverse().slice(0, 6)) {
      html += `<li><span class="day">H${e.day}</span> ${esc(e.text)}</li>`;
    }
    html += `</ul>`;
  }

  el.innerHTML = html;
}

export function renderLog(el, sim) {
  const html = [...sim.logs].reverse().map(l =>
    `<div class="entry ${l.type}"><span class="day">H${l.day}</span>${esc(l.msg)}</div>`
  ).join('');
  if (el.dataset.last !== String(sim.logs.length) + (sim.logs[sim.logs.length - 1]?.msg || '')) {
    el.innerHTML = html;
    el.dataset.last = String(sim.logs.length) + (sim.logs[sim.logs.length - 1]?.msg || '');
  }
}

export function renderStats(el, sim) {
  const pop = sim.npcs.length;
  const kids = sim.npcs.filter(n => !n.isAdult).length;
  const houses = sim.npcs.filter(n => n.home).length;
  const m = sim.market;
  const memeCounts = MEME_POOL
    .map(mm => ({ mm, c: sim.countMeme(mm.id) }))
    .filter(x => x.c > 0)
    .sort((a, b) => b.c - a.c);
  const topMeme = memeCounts[0] ? `${memeCounts[0].mm.emoji} ${memeCounts[0].mm.name} (${memeCounts[0].c})` : '—';

  const techIcons = TECHS.filter(t => sim.techs.has(t.id)).map(t => `<span title="${t.name}">${t.emoji}</span>`).join('') || '—';
  const k = sim.know;

  el.innerHTML = `
    <span>🏛️ <b>${eraName(sim.techs.size)}</b> · ${techIcons}</span>
    <span>👥 Populasi <b>${pop}</b> (${kids} anak)</span>
    <span>🏠 Berumah <b>${houses}</b></span>
    <span>📚 Ilmu: 🌾${Math.round(k.tani)} 🪓${Math.round(k.kayu)} 🏗️${Math.round(k.konstruksi)} 💰${Math.round(k.dagang)}</span>
    <span>🍖 Harga pangan <b>${m.prices.food}</b></span>
    <span>👶 ${sim.stats.births} · ⚰️ ${sim.stats.deaths} · 💞 ${sim.stats.weddings}</span>
    <span>🎭 Budaya: <b>${topMeme}</b></span>`;
}

export function renderClock(el, sim) {
  const w = sim.world;
  const h = Math.floor(w.hour), mnt = Math.floor((w.hour % 1) * 60);
  const pad = (n) => String(n).padStart(2, '0');
  el.textContent = `📅 Hari ${w.day} · ${w.seasonName} · 🕐 ${pad(h)}:${pad(mnt)} ${w.isNight ? '🌙' : '☀️'}`;
}
