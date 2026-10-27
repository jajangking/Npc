import { Sim } from './src/sim.js';
import { serializeSim, restoreSim } from './src/persist.js';

for (const seed of [55, 7]) {
  const sim = new Sim(seed);
  while (sim.world.day < 250) sim.step();
  const tools = sim.npcs.filter(n => n.tools).length;
  console.log(`seed ${seed}: H250 pop ${sim.npcs.length} | techs ${sim.techs.size}/9 [${[...sim.techs].join(',')}]`);
  console.log(`  bengkel ${!!sim.smithy} | menara ${!!sim.tower} (serangan serigala: ${sim.wolfAttacks}) | candi ${!!sim.candi} (progress ${sim.candiProgress}) | perkakas: ${tools} warga`);
  // roundtrip save/load dengan field baru
  const sim2 = restoreSim(JSON.parse(JSON.stringify(serializeSim(sim))));
  for (let i = 0; i < 4500; i++) sim2.step();
  console.log(`  roundtrip OK: hari ${sim2.world.day}, bengkel ${!!sim2.smithy}, tools ${sim2.npcs.filter(n=>n.tools).length}`);
}
