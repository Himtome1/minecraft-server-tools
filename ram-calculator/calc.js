// RAM size rule. Plain script: works in a browser via <script src="calc.js"> and in Node via require().
//
// kind 'catalog':   rec for 1-5 players; 6-10 -> max(rec + 2, group); 11-20 -> max(rec + 4, group + 2); never below min.
// kind 'reference': the pack's own a / b / c sizes for 1-5 / 6-10 / 11-20 players.
// kind 'other':     base for 1-5 players, then about 1 GB for every 3 extra players (+2 / +4).
(function (root) {
  'use strict';
  function calc(p, players) {
    if (p.kind === 'reference') return players <= 5 ? p.a : players <= 10 ? p.b : p.c;
    var r = p.kind === 'catalog' ? p.rec : p.base;
    var g = p.kind === 'catalog' ? p.group || 0 : 0;
    var n = players <= 5 ? r : players <= 10 ? Math.max(r + 2, g) : Math.max(r + 4, g ? g + 2 : 0);
    return Math.max(n, p.min || 3);
  }
  /** data.json -> one flat list with a kind on every entry. */
  function entries(data) {
    return [].concat(
      data.catalog.map(function (x) { return Object.assign({ kind: 'catalog' }, x); }),
      data.reference.map(function (x) { return Object.assign({ kind: 'reference' }, x); }),
      data.other.map(function (x) { return Object.assign({ kind: 'other' }, x); })
    );
  }
  var api = { calc: calc, entries: entries };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RamCalc = api;
})(this);
