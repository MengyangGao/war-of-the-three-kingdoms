'use strict';

/* Structural validation for data registries and browser/headless load order. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const HEADLESS_FILES = require('./_files');
const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const browserFiles = [...indexHtml.matchAll(/<script\s+src="([^"]+)"/g)].map(match => match[1]);

let failures = 0;
function assert(condition, message) {
  if (!condition) {
    failures++;
    console.error('FAIL:', message);
  }
}

assert(indexHtml.includes('<title>三分天下 · 风云牌局</title>'), 'public title is not the original project brand');
assert(!indexHtml.includes('三国杀'), 'legacy commercial brand leaked into the public page');
for (const id of ['phaseRail', 'gameControls', 'generalSelection', 'licenseBtn']) {
  assert(indexHtml.includes(`id="${id}"`), `missing redesigned UI contract: #${id}`);
}

for (const file of browserFiles) {
  const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
  new vm.Script(source, { filename: file });
}

let cursor = -1;
for (const file of HEADLESS_FILES) {
  const next = browserFiles.indexOf(file);
  assert(next > cursor, `headless load order differs from index.html: ${file}`);
  cursor = next;
}

const sandbox = { console, Math, Date, JSON, setTimeout, clearTimeout, setInterval, clearInterval, Promise, Infinity, parseInt, parseFloat };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const file of HEADLESS_FILES.concat(['js/15-art.js'])) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), sandbox, { filename: file });
}
const SGS = sandbox.SGS;
assert(typeof SGS.Presentation.opponentsSignature === 'function', 'missing pure presentation projection');
assert(typeof SGS.Presentation.selfSignature === 'function', 'missing self-view projection');

for (const general of SGS.generalList()) {
  assert(!!SGS.NATIONS[general.nation], `${general.key}: unknown nation ${general.nation}`);
  assert(general.gender === 'male' || general.gender === 'female', `${general.key}: invalid gender`);
  assert(Number.isInteger(general.hp) && general.hp > 0, `${general.key}: invalid hp`);
  for (const skill of (general.skills || []).concat(general.lordSkills || [])) {
    assert(!!SGS.SKILLS[skill], `${general.key}: unknown skill ${skill}`);
  }
}

const deck = SGS.buildDeck();
assert(deck.length === 130, `unexpected deck size ${deck.length}`);
assert(new Set(deck.map(card => card.id)).size === deck.length, 'deck card ids are not unique');
for (const card of deck) {
  assert(!!SGS.CARD_DB[card.name], `${card.id}: unknown card ${card.name}`);
  assert(!!SGS.SUITS[card.suit], `${card.id}: invalid suit ${card.suit}`);
  assert(Number.isInteger(card.rank) && card.rank >= 1 && card.rank <= 13, `${card.id}: invalid rank ${card.rank}`);
}

for (const key of Object.keys(SGS.ART.PORTRAITS)) {
  assert(fs.existsSync(path.join(ROOT, 'assets', 'generals', `${key}.jpg`)), `missing portrait: ${key}.jpg`);
  assert(!!SGS.GENERALS[key], `portrait has no matching general: ${key}`);
}

const attributionPath = path.join(ROOT, 'assets', 'ATTRIBUTION.json');
assert(fs.existsSync(attributionPath), 'missing machine-readable asset attribution ledger');
if (fs.existsSync(attributionPath)) {
  const attribution = JSON.parse(fs.readFileSync(attributionPath, 'utf8'));
  assert(attribution.schema_version === 1, 'unsupported attribution schema');
  assert(Array.isArray(attribution.errors) && attribution.errors.length === 0, 'asset audit contains errors');
  const auditedKeys = new Set((attribution.assets || []).filter(item => item.allowed).map(item => item.key));
  for (const key of Object.keys(SGS.ART.PORTRAITS)) {
    assert(auditedKeys.has(key), `portrait is missing an allowed audit record: ${key}`);
  }
}

console.log(`Validated ${browserFiles.length} scripts, ${SGS.generalList().length} generals, ${deck.length} cards, and ${Object.keys(SGS.ART.PORTRAITS).length} portraits.`);
console.log('RESULT:', failures === 0 ? 'PASS' : 'FAIL');
process.exit(failures === 0 ? 0 : 1);
