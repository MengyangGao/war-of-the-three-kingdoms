/* ==========================================================================
 * Headless test harness (Node).
 *   Loads the browser JS files into a shared VM sandbox (same files the
 *   browser uses), then runs many full AI-vs-AI games, checking for errors,
 *   card conservation, and valid win conditions.
 *
 *   Usage: node test/run.js [games] [players] [seed]
 * ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const FILES = require('./_files');

function loadSandbox() {
  const sandbox = {
    console: console,
    Math: Math,
    Date: Date,
    JSON: JSON,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    Promise: Promise,
    Infinity: Infinity,
    parseInt: parseInt,
    parseFloat: parseFloat
  };
  sandbox.window = sandbox;         // files attach to window.SGS
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const f of FILES) {
    const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
    try {
      vm.runInContext(code, sandbox, { filename: f });
    } catch (e) {
      console.error('Failed loading ' + f + ': ' + e.stack);
      process.exit(1);
    }
  }
  return sandbox.SGS;
}

function countRealCards(SGS, card, acc) {
  if (card.virtual) { for (const s of card.subcards) acc.push(s); }
  else acc.push(card);
}

function totalCards(SGS, game) {
  const acc = [];
  for (const c of game.deck) countRealCards(SGS, c, acc);
  for (const c of game.discard) countRealCards(SGS, c, acc);
  for (const p of game.players) {
    for (const c of p.hand) countRealCards(SGS, c, acc);
    for (const k in p.equips) if (p.equips[k]) countRealCards(SGS, p.equips[k], acc);
    for (const c of p.judgeZone) countRealCards(SGS, c, acc);
  }
  // dedupe by id to detect duplication
  const ids = new Set();
  let dup = 0;
  for (const c of acc) { if (ids.has(c.id)) dup++; ids.add(c.id); }
  return { total: acc.length, unique: ids.size, dup: dup };
}

function pickGenerals(SGS, rng, n) {
  const keys = Object.keys(SGS.GENERALS);
  rng.shuffle(keys);
  return keys.slice(0, n);
}

async function runGame(SGS, numPlayers, seed, opts) {
  opts = opts || {};
  const game = new SGS.Game({ numPlayers: numPlayers, seed: seed, throwErrors: true, maxTurns: opts.maxTurns || 1500 });
  game.setup();
  const deckSize = game.deck.length;
  const gens = pickGenerals(SGS, game.rng, numPlayers);
  game.assignGenerals(gens);
  for (const p of game.players) p.agent = SGS.AIAgent;
  game.dealInitialHands();

  let err = null;
  try {
    await game.start();
  } catch (e) {
    err = e;
  }

  const cc = totalCards(SGS, game);
  const conserved = (cc.unique === deckSize && cc.dup === 0);

  return {
    seed, numPlayers,
    winner: game.winners,
    turns: game.turnCount,
    finished: game.finished,
    err: err ? (err.stack || String(err)) : null,
    cardCheck: cc,
    deckSize,
    conserved,
    logLen: game.log.length,
    generals: gens
  };
}

async function main() {
  const SGS = loadSandbox();
  const nGames = parseInt(process.argv[2] || '30', 10);
  const players = parseInt(process.argv[3] || '8', 10);
  const baseSeed = parseInt(process.argv[4] || '1', 10);

  console.log(`Loaded SGS. Generals: ${Object.keys(SGS.GENERALS).length}, Deck: ${SGS.buildDeck().length} cards.`);
  console.log(`Running ${nGames} games with ${players} players...\n`);

  const wins = { lord: 0, rebel: 0, traitor: 0, draw: 0 };
  let errors = 0, unconserved = 0, unfinished = 0;
  let totalTurns = 0;
  const errSamples = [];

  for (let i = 0; i < nGames; i++) {
    const seed = baseSeed + i * 7919;
    const r = await runGame(SGS, players, seed);
    if (r.err) {
      errors++;
      if (errSamples.length < 5) errSamples.push({ seed, err: r.err, generals: r.generals });
    }
    if (!r.conserved) {
      unconserved++;
      if (errSamples.length < 8) errSamples.push({ seed, cardCheck: r.cardCheck, deckSize: r.deckSize, note: 'card conservation' });
    }
    if (!r.finished || r.winner === 'draw') unfinished++;
    if (r.winner && wins[r.winner] != null) wins[r.winner]++;
    totalTurns += r.turns;
    const flag = r.err ? 'ERR' : (!r.conserved ? 'CARD' : (r.winner === 'draw' ? 'DRAW' : 'ok '));
    process.stdout.write(`#${String(i + 1).padStart(3)} seed=${String(seed).padStart(7)} ${flag} winner=${String(r.winner).padEnd(7)} turns=${String(r.turns).padStart(4)} cards=${r.cardCheck.unique}/${r.deckSize}\n`);
  }

  console.log('\n================ SUMMARY ================');
  console.log('Games        :', nGames);
  console.log('Errors       :', errors);
  console.log('Card issues  :', unconserved);
  console.log('Unfinished   :', unfinished);
  console.log('Avg turns    :', (totalTurns / nGames).toFixed(1));
  console.log('Win rates    :', JSON.stringify(wins));
  if (errSamples.length) {
    console.log('\n--- samples ---');
    for (const s of errSamples) {
      console.log(JSON.stringify({ seed: s.seed, note: s.note, cardCheck: s.cardCheck, deckSize: s.deckSize, generals: s.generals }));
      if (s.err) console.log(s.err.split('\n').slice(0, 6).join('\n'));
    }
  }
  const ok = errors === 0 && unconserved === 0;
  console.log('\nRESULT:', ok ? 'PASS' : 'FAIL');
  process.exit(ok ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
