const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { calc, entries } = require('../calc.js');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data.json'), 'utf8'));
const all = Object.fromEntries(entries(data).map((p) => [p.id, p]));

test('catalog packs: rec for small groups, group size for 6-10, +2 past that', () => {
  assert.equal(calc(all.cobblemon, 4), 5);
  assert.equal(calc(all.cobblemon, 8), 8);
  assert.equal(calc(all.cobblemon, 15), 10);
  assert.equal(calc(all.paper, 1), 3);
  assert.equal(calc(all.paper, 7), 5);
});

test('reference packs use their own a/b/c sizes', () => {
  assert.deepEqual([calc(all.gtnh, 5), calc(all.gtnh, 6), calc(all.gtnh, 11)], [6, 10, 14]);
});

test('other packs: base, then +2 / +4, never below 3', () => {
  assert.deepEqual([calc(all['other-lt100'], 3), calc(all['other-lt100'], 9), calc(all['other-gt200'], 20)], [4, 6, 12]);
});

test('every reference row has a source URL and every entry has a unique id', () => {
  for (const r of data.reference) assert.match(r.source.url, /^https:\/\//);
  assert.equal(new Set(entries(data).map((p) => p.id)).size, entries(data).length);
});
