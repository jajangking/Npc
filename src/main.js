import { Sim } from './sim.js';
import { W, H, TILE } from './world.js';
import { render, pickNpc } from './render.js';
import { renderInspector, renderLog, renderStats, renderClock } from './ui.js';

const canvas = document.getElementById('world');
canvas.width = W * TILE;
canvas.height = H * TILE;
const ctx = canvas.getContext('2d');

let sim = new Sim((Math.random() * 1e9) | 0);
let selected = null;
let speed = 1;
let paused = false;

// ---- kontrol ----
const btnPause = document.getElementById('btn-pause');
btnPause.onclick = () => {
  paused = !paused;
  btnPause.textContent = paused ? '▶' : '⏸';
  btnPause.classList.toggle('active', paused);
};
for (const [id, sp] of [['btn-1x', 1], ['btn-4x', 4], ['btn-16x', 16]]) {
  document.getElementById(id).onclick = (e) => {
    speed = sp; paused = false;
    btnPause.textContent = '⏸'; btnPause.classList.remove('active');
    document.querySelectorAll('.speed').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
  };
}
document.getElementById('btn-reset').onclick = () => {
  sim = new Sim((Math.random() * 1e9) | 0);
  selected = null;
};

canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect();
  const mx = ((e.clientX - rect.left) / rect.width) * W;
  const my = ((e.clientY - rect.top) / rect.height) * H;
  selected = pickNpc(sim, mx, my);
});

// ---- loop utama ----
const elInspector = document.getElementById('inspector');
const elLog = document.getElementById('log');
const elStats = document.getElementById('stats-bar');
const elClock = document.getElementById('clock');

let frame = 0;
function loop() {
  if (!paused) {
    for (let i = 0; i < speed; i++) sim.step();
  }
  render(ctx, sim, selected);
  frame++;
  if (frame % 12 === 0) {
    if (selected && !selected.alive) selected = null;
    renderInspector(elInspector, sim, selected);
    renderLog(elLog, sim);
    renderStats(elStats, sim);
  }
  renderClock(elClock, sim);
  requestAnimationFrame(loop);
}
loop();
