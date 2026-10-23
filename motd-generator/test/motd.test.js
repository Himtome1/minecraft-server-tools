const test = require('node:test');
const assert = require('node:assert/strict');
const { norm, parseMotd, toProps, toPlain, toMini } = require('../motd.js');

test('& codes become § codes, other & stays', () => {
  assert.equal(norm('&cRed & &zno'), '§cRed & &zno');
});

test('a colour clears formats; §r resets; formats stack', () => {
  const [l] = parseMotd(['§l§oBold italic §aGreen §lbold §rplain']);
  assert.deepEqual(l.segs.map((s) => [s.t, s.c, s.l, s.o]), [
    ['Bold italic ', '', 1, 1], ['Green ', 'a', 0, 0], ['bold ', 'a', 1, 0], ['plain', '', 0, 0],
  ]);
  assert.equal(l.vis, 'Bold italic Green bold plain'.length);
});

test('line 2 inherits line 1 style; trailing § dropped', () => {
  const p = parseMotd(['&6gold', 'still gold§']);
  assert.equal(p[1].segs[0].c, '6');
  assert.equal(p[1].segs[0].t, 'still gold');
});

test('server.properties escapes non-ASCII, backslash and the line break', () => {
  assert.equal(toProps(['&aHi \\ é', '&bTwo']), 'motd=\\u00A7aHi \\\\ \\u00E9\\n\\u00A7bTwo');
  assert.equal(toProps([' lead', '']), 'motd=\\ lead');
});

test('plain text drops an empty second line', () => {
  assert.equal(toPlain(['&cOne', '']), '§cOne');
  assert.equal(toPlain(['&cOne', 'Two']), '§cOne\nTwo');
});

test('MiniMessage: lazy tags, reset where legacy drops a style, < escaped', () => {
  assert.equal(toMini(['&6&lHi &7a<b>']), '<gold><bold>Hi <reset><gray>a\\<b>');
  assert.equal(toMini(['&cRed', 'more']), '<red>Red<newline>more');
});

test('markup in the MOTD stays text', () => {
  const [l] = parseMotd(['<img src=x onerror=alert(1)>']);
  assert.equal(l.segs[0].t, '<img src=x onerror=alert(1)>');
});
