// Minecraft MOTD helpers: parse legacy § / & codes the way the Java Edition server list draws them,
// and write the MOTD for server.properties, as plain § text, or as MiniMessage.
//
// Java legacy rules (the client's text renderer and Paper's legacy parser behave the same way):
// - a colour code clears bold/italic/underline/strike/obfuscated; §r clears everything back to the list's default grey;
// - formats stack; § followed by any character is consumed (unknown codes do nothing); a lone trailing § is dropped;
// - the MOTD is ONE string with a line break, so line 2 keeps line 1's colour and formats unless codes are typed there.
//
// Plain script: works in a browser via <script src="motd.js"> (also from file://) and in Node via require().
(function (root) {
  'use strict';

  var COLOURS = [
    ['0', 'Black', 'black'], ['1', 'Dark Blue', 'dark_blue'], ['2', 'Dark Green', 'dark_green'], ['3', 'Dark Aqua', 'dark_aqua'],
    ['4', 'Dark Red', 'dark_red'], ['5', 'Dark Purple', 'dark_purple'], ['6', 'Gold', 'gold'], ['7', 'Gray', 'gray'],
    ['8', 'Dark Gray', 'dark_gray'], ['9', 'Blue', 'blue'], ['a', 'Green', 'green'], ['b', 'Aqua', 'aqua'],
    ['c', 'Red', 'red'], ['d', 'Light Purple', 'light_purple'], ['e', 'Yellow', 'yellow'], ['f', 'White', 'white'],
  ];
  // Java Edition palette (foreground colours).
  var HEX = { 0: '#000000', 1: '#0000aa', 2: '#00aa00', 3: '#00aaaa', 4: '#aa0000', 5: '#aa00aa', 6: '#ffaa00', 7: '#aaaaaa',
    8: '#555555', 9: '#5555ff', a: '#55ff55', b: '#55ffff', c: '#ff5555', d: '#ff55ff', e: '#ffff55', f: '#ffffff' };
  var FORMATS = [['l', 'Bold', 'B'], ['o', 'Italic', 'I'], ['n', 'Underline', 'U'], ['m', 'Strikethrough', 'S'], ['k', 'Obfuscated', '?'], ['r', 'Reset', 'R']];

  /** `&c` style codes -> `§c`. Only & followed by a real code letter/digit is converted. */
  function norm(s) { return String(s).replace(/&([0-9a-fk-or])/gi, '§$1'); }

  /** Both lines -> [{ segs: [{t, c, l, o, n, m, k}], vis }] with the style carried across the line break. */
  function parseMotd(lines) {
    var st = { c: '', l: 0, o: 0, n: 0, m: 0, k: 0 }, out = [];
    for (var li = 0; li < lines.length; li++) {
      var chars = Array.from(norm(lines[li])), segs = [], buf = '', vis = 0;
      var flush = function () { if (buf) segs.push({ t: buf, c: st.c, l: st.l, o: st.o, n: st.n, m: st.m, k: st.k }); buf = ''; };
      for (var i = 0; i < chars.length; i++) {
        if (chars[i] === '§') {
          if (i + 1 >= chars.length) break;
          var code = chars[++i].toLowerCase();
          if (/[0-9a-f]/.test(code)) { flush(); st = { c: code, l: 0, o: 0, n: 0, m: 0, k: 0 }; }
          else if (code === 'r') { flush(); st = { c: '', l: 0, o: 0, n: 0, m: 0, k: 0 }; }
          else if (/[lonmk]/.test(code) && !st[code]) { flush(); st = Object.assign({}, st); st[code] = 1; }
          continue;
        }
        buf += chars[i]; vis++;
      }
      flush();
      out.push({ segs: segs, vis: vis });
    }
    return out;
  }

  /** server.properties value: every non-ASCII char (incl. §) as \uXXXX, line break as \n. Safe in any file encoding. */
  function toProps(lines) {
    var s = lines.map(norm).filter(function (x, i) { return i === 0 || x !== ''; }).join('\n'), o = '';
    for (var i = 0; i < s.length; i++) {
      var ch = s[i], cc = s.charCodeAt(i);
      if (ch === '\\') o += '\\\\';
      else if (ch === '\n') o += '\\n';
      else if (ch === ' ' && i === 0) o += '\\ ';
      else if (cc < 0x20 || cc > 0x7e) o += '\\u' + ('000' + cc.toString(16).toUpperCase()).slice(-4);
      else o += ch;
    }
    return 'motd=' + o;
  }

  /** Plain legacy text, one line per MOTD line. */
  function toPlain(lines) { return lines.map(norm).filter(function (x, i) { return i === 0 || x !== ''; }).join('\n'); }

  /** MiniMessage that renders like the legacy text: tags open lazily, <reset> wherever legacy would drop a style. */
  function toMini(lines) {
    var NAMES = { 0: 'black', 1: 'dark_blue', 2: 'dark_green', 3: 'dark_aqua', 4: 'dark_red', 5: 'dark_purple', 6: 'gold', 7: 'gray', 8: 'dark_gray', 9: 'blue', a: 'green', b: 'aqua', c: 'red', d: 'light_purple', e: 'yellow', f: 'white' };
    var TAGS = { l: 'bold', o: 'italic', n: 'underlined', m: 'strikethrough', k: 'obfuscated' }, F = ['l', 'o', 'n', 'm', 'k'];
    var parsed = parseMotd(lines), cur = { c: '', l: 0, o: 0, n: 0, m: 0, k: 0 }, out = '';
    var esc = function (t) { return t.replace(/\\/g, '\\\\').replace(/</g, '\\<'); };
    parsed.forEach(function (line, li) {
      if (li > 0 && (line.segs.length || lines[li] !== '')) out += '<newline>';
      line.segs.forEach(function (s) {
        var same = s.c === cur.c && F.every(function (f) { return s[f] === cur[f]; });
        if (!same) {
          var grows = s.c === cur.c && F.every(function (f) { return s[f] >= cur[f]; });
          if (!grows) {
            if (cur.c || F.some(function (f) { return cur[f]; })) out += '<reset>';
            cur = { c: '', l: 0, o: 0, n: 0, m: 0, k: 0 };
            if (s.c) out += '<' + NAMES[s.c] + '>';
            cur.c = s.c;
          }
          F.forEach(function (f) { if (s[f] && !cur[f]) { out += '<' + TAGS[f] + '>'; cur[f] = 1; } });
        }
        out += esc(s.t);
      });
    });
    return out;
  }

  var api = { COLOURS: COLOURS, HEX: HEX, FORMATS: FORMATS, norm: norm, parseMotd: parseMotd, toProps: toProps, toPlain: toPlain, toMini: toMini };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MOTD = api;
})(this);
