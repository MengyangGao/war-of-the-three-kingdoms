'use strict';
// Prove: a dying player with no 桃/酒/rescue option in anyone's hand is NOT
// asked to rescue, and simply dies.
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
const FILES = require('./_files');
const s = { console, Math, Date, JSON, setTimeout, clearTimeout, Promise, Infinity, parseInt, parseFloat };
s.window = s; s.globalThis = s; vm.createContext(s);
for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), s, { filename: f });
const SGS = s.SGS;

(async () => {
  const game = new SGS.Game({ numPlayers: 5, seed: 7, throwErrors: true });
  game.setup();
  // avoid 华佗(jijiu red-as-tao) so 'no rescue option' truly holds
  const gens = ['caocao','simayi','xiahoudun','zhangliao','xuchu'];
  game.assignGenerals(gens);
  let rescueAsks = 0;
  const agent = { decide(g, p, req) { if (req.type === 'rescue') rescueAsks++; return null; } };
  game.players.forEach(p => { p.agent = agent; p.hand = []; }); // no cards anywhere
  game.deck = game.deck.filter(c => c.name !== 'tao' && c.name !== 'jiu');
  game.current = game.players[0];

  const victim = game.players[2];
  victim.hp = 0;
  await game.enterDying(victim, { source: game.players[0], target: victim });

  const pass = (rescueAsks === 0) && (victim.alive === false);
  console.log('rescue prompts issued:', rescueAsks, '(expected 0)');
  console.log('victim alive:', victim.alive, '(expected false)');
  console.log('RESULT:', pass ? 'PASS' : 'FAIL');
  process.exit(pass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
