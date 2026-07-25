'use strict';

/* Deterministic 3–8 player balance matrix.
 * This is a regression gate, not a claim that fixed-seed AI mirrors humans. */
const { loadSandbox, runGame } = require('./run');

const gamesPerTable = parseInt(process.argv[2] || '200', 10);
const SGS = loadSandbox();
const MIN_TRAITOR_RATE = { 3: 0.15, 4: 0.08, 5: 0.05, 6: 0.03, 7: 0.03, 8: 0.03 };

function percentile(values, ratio) {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
}

async function assess(players) {
  const wins = { lord: 0, rebel: 0, traitor: 0, draw: 0 };
  const turns = [];
  let issues = 0;
  for (let i = 0; i < gamesPerTable; i++) {
    const result = await runGame(SGS, players, 1 + i * 7919);
    if (result.winner && wins[result.winner] != null) wins[result.winner]++;
    turns.push(result.turns);
    if (result.err || !result.conserved || result.invalidEvents || !result.finished || result.winner === 'draw') issues++;
  }
  const traitorRate = wins.traitor / gamesPerTable;
  const dominantRate = Math.max(wins.lord, wins.rebel) / gamesPerTable;
  const p95 = percentile(turns, 0.95);
  const pass = issues === 0 &&
    traitorRate >= MIN_TRAITOR_RATE[players] &&
    dominantRate <= 0.70 &&
    p95 <= 100;
  return {
    players, wins, issues, traitorRate, dominantRate, p95,
    avg: turns.reduce((sum, value) => sum + value, 0) / turns.length,
    pass
  };
}

(async function main() {
  console.log(`Balance matrix: ${gamesPerTable} fixed-seed games per table`);
  console.log('人数 | 主忠 | 反贼 | 内奸 | 内奸率 | 平均回合 | P95 | 结果');
  console.log('-----|------|------|------|--------|----------|-----|-----');
  const results = [];
  for (let players = 3; players <= 8; players++) results.push(await assess(players));
  for (const row of results) {
    console.log(
      `${String(row.players).padStart(4)} | ${String(row.wins.lord).padStart(4)} | ` +
      `${String(row.wins.rebel).padStart(4)} | ${String(row.wins.traitor).padStart(4)} | ` +
      `${(row.traitorRate * 100).toFixed(1).padStart(5)}% | ${row.avg.toFixed(1).padStart(8)} | ` +
      `${String(row.p95).padStart(3)} | ${row.pass ? 'PASS' : 'FAIL'}`
    );
  }
  const failed = results.filter(row => !row.pass);
  console.log(`RESULT: ${failed.length ? 'FAIL' : 'PASS'}`);
  process.exit(failed.length ? 1 : 0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
