// Page script for index.html. Loads data.json (serve the folder over http, see the README), draws with textContent only.
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var sel = $('pack'), rng = $('players'), plo = $('plout'), out = $('out');
  var CPU = "More RAM won't fix every kind of lag. Minecraft runs most of the world on one main thread. On tech-heavy packs and big groups, " +
    "that thread is usually the limit, not memory. What helps: pre-generate your world, keep chunk loaders under control, and use a profiler " +
    "such as spark (/spark health, /spark profiler) to see what's slow. Only add RAM if the profiler shows memory is the problem.";

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  function why(p, n, g) {
    if (p.kind === 'catalog') {
      var s = p.name + ' starts at ' + p.rec + ' GB for 2–5 players.';
      if (n > 5) s += p.group ? ' The estimate for 6–10 players is ' + p.group + ' GB' + (n > 10 ? ', plus about 1 GB for every 3 extra players past that.' : '.') : ' Plus about 1 GB for every 3 extra players past 5.';
      return s;
    }
    if (p.kind === 'reference') {
      var r = p.name + ' is usually run at ' + p.a + ' GB for a small group (pack listings and public server guides).';
      if (n > 5) r += ' For ' + (n > 10 ? '10–20' : '6–10') + ' players the estimate is ' + g + ' GB.';
      return r;
    }
    var o = p.base === 4 ? 'Lighter or older packs usually run on 4–6 GB for a small group.' : p.base === 6 ? "Newer (1.18+) modpacks shouldn't go below 6 GB." : 'Big kitchen-sink packs usually start at 8 GB.';
    if (n > 5) o += ' Plus about 1 GB for every 3 extra players past 5.';
    return o;
  }

  function start(data) {
    var all = {}, groups = [['Catalog packs', 'catalog'], ['Other popular packs (reference only)', 'reference'], ['Another modpack', 'other']];
    RamCalc.entries(data).forEach(function (p) { all[p.id] = p; });
    groups.forEach(function (g) {
      var og = el('optgroup'); og.label = g[0];
      Object.keys(all).forEach(function (id) { if (all[id].kind === g[1]) { var o = el('option', null, all[id].name); o.value = id; og.appendChild(o); } });
      sel.appendChild(og);
    });
    sel.value = 'cobblemon';
    data.reference.forEach(function (r) {
      var li = el('li'), a = el('a', null, r.source.label); a.href = r.source.url; a.rel = 'nofollow noopener'; li.appendChild(a); $('sources').appendChild(li);
    });
    function render() {
      var p = all[sel.value], n = +rng.value, g = RamCalc.calc(p, n);
      plo.textContent = n;
      while (out.firstChild) out.removeChild(out.firstChild);
      var big = el('p', 'big', 'Start with '); big.appendChild(el('b', null, g + ' GB')); out.appendChild(big);
      out.appendChild(el('p', 'why', why(p, n, g)));
      if (n >= 6) out.appendChild(el('p', 'hint', 'Sizes for bigger groups are estimates.'));
      if (p.cpu || n >= 11) out.appendChild(el('p', 'cpu', CPU));
    }
    sel.addEventListener('change', render);
    rng.addEventListener('input', render);
    render();
  }

  fetch('data.json').then(function (r) { return r.json(); }).then(start, function () {
    $('loading').textContent = "Couldn't load data.json. Open this page through a local web server (npm start), not as a file.";
  });
})();
