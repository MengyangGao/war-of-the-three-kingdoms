'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
const FILES = require('./_files');
const sandbox = { console, Math, Date, JSON, setTimeout, clearTimeout, Promise, Infinity, parseInt, parseFloat };
sandbox.window = sandbox; sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(ROOT, f),'utf8'), sandbox, {filename:f});
const SGS = sandbox.SGS;

(async () => {
  const seed = parseInt(process.argv[2]||'1',10);
  const np = parseInt(process.argv[3]||'8',10);
  const game = new SGS.Game({ numPlayers: np, seed, throwErrors: true, maxTurns: 1500 });
  game.setup();
  const keys = Object.keys(SGS.GENERALS); game.rng.shuffle(keys);
  const gens = keys.slice(0, np);
  game.assignGenerals(gens);
  for (const p of game.players) p.agent = SGS.AIAgent;
  game.dealInitialHands();
  console.log('Seat setup:');
  game.players.forEach(p => console.log(`  seat${p.seat} ${p.general.cn}(${SGS.NATIONS[p.nation].cn}/${p.gender==='male'?'男':'女'}) ${SGS.ROLES[p.role].cn} hp${p.hp}/${p.maxHp} skills=[${p.general.skills.join(',')}]`));
  console.log('----- log -----');
  await game.start();
  game.log.forEach(e => console.log('  ' + e.text));
  console.log('----- end: winner=' + game.winners + ' turns=' + game.turnCount + ' -----');
})();
