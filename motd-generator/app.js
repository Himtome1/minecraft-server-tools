// Page script for index.html. Everything is drawn with DOM nodes and textContent (no innerHTML).
(function () {
  'use strict';
  var M = window.MOTD, $ = function (id) { return document.getElementById(id); };
  var l1 = $('l1'), l2 = $('l2'), nm = $('name'), last = l1, timer = 0, hasK = false;
  var OBF = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var RM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)');

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function obf(t, rnd) { return Array.from(t).map(function (ch, i) { return ch === ' ' ? ' ' : OBF[rnd ? Math.floor(Math.random() * OBF.length) : (i * 7 + 3) % OBF.length]; }).join(''); }

  // Toolbar: 16 colours, then formats.
  var tb = $('tb');
  M.COLOURS.forEach(function (c) {
    var b = el('button', 'sw'); b.type = 'button'; b.dataset.code = c[0]; b.style.background = M.HEX[c[0]];
    b.title = c[1] + ' &' + c[0]; b.setAttribute('aria-label', c[1] + ' (&' + c[0] + ')'); tb.appendChild(b);
  });
  tb.appendChild(el('span', 'sep'));
  M.FORMATS.forEach(function (f) {
    var b = el('button', 'fmt', f[2]); b.type = 'button'; b.dataset.code = f[0];
    b.title = f[1] + ' &' + f[0]; b.setAttribute('aria-label', f[1] + ' (&' + f[0] + ')'); tb.appendChild(b);
  });

  function drawLine(box, segs) {
    while (box.firstChild) box.removeChild(box.firstChild);
    segs.forEach(function (s) {
      var sp = el('span', [s.l ? 'fl' : '', s.o ? 'fo' : '', s.n ? 'fn' : '', s.m ? 'fm' : ''].filter(Boolean).join(' '));
      if (s.c) sp.style.color = M.HEX[s.c];
      if (s.k) { sp.dataset.k = '1'; sp._t = s.t; sp.textContent = obf(s.t, 0); } else sp.textContent = s.t;
      box.appendChild(sp);
    });
  }
  function count(box, n) { box.textContent = n + ' visible character' + (n === 1 ? '' : 's') + (n > 45 ? ' · Long lines may be cut off in the server list.' : ''); }
  function tick() {
    clearInterval(timer); timer = 0;
    if (!hasK || (RM && RM.matches)) return;
    timer = setInterval(function () { [].forEach.call(document.querySelectorAll('#pv [data-k]'), function (e) { e.textContent = obf(e._t, 1); }); }, 90);
  }
  function render() {
    var L = [l1.value, l2.value], p = M.parseMotd(L);
    drawLine($('p1'), p[0].segs); drawLine($('p2'), p[1].segs);
    count($('c1'), p[0].vis); count($('c2'), p[1].vis);
    $('o-props').value = M.toProps(L); $('o-plain').value = M.toPlain(L); $('o-mini').value = M.toMini(L);
    hasK = p.some(function (x) { return x.segs.some(function (s) { return s.k; }); });
    tick();
  }

  [l1, l2].forEach(function (inp) { inp.addEventListener('input', render); inp.addEventListener('focus', function () { last = inp; }); });
  nm.addEventListener('input', function () { $('pn').textContent = nm.value; });
  if (RM && RM.addEventListener) RM.addEventListener('change', render);
  [].forEach.call(tb.querySelectorAll('button'), function (b) {
    b.addEventListener('mousedown', function (e) { e.preventDefault(); });
    b.addEventListener('click', function () {
      var inp = last, code = '&' + b.dataset.code;
      var s = inp.selectionStart == null ? inp.value.length : inp.selectionStart, e = inp.selectionEnd == null ? s : inp.selectionEnd;
      if (inp.value.length - (e - s) + code.length > inp.maxLength) return;
      inp.value = inp.value.slice(0, s) + code + inp.value.slice(e);
      inp.focus(); inp.setSelectionRange(s + code.length, s + code.length); render();
    });
  });
  [].forEach.call(document.querySelectorAll('[data-copy]'), function (b) {
    b.addEventListener('click', function () {
      var ta = $(b.dataset.copy), done = function () { b.textContent = 'Copied'; setTimeout(function () { b.textContent = 'Copy'; }, 1500); };
      var fallback = function () { ta.select(); try { document.execCommand('copy'); done(); } catch (e) { /* select is enough */ } };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(ta.value).then(done, fallback); else fallback();
    });
  });
  $('pn').textContent = nm.value;
  render();
})();
