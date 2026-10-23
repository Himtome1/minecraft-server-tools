// Java Edition Server List Ping (1.7+): handshake with next state 1, status request, then ping/pong for latency.
// One connection per check, 3 s connect timeout, 5 s total, 64 KB response cap, no legacy (pre-1.7) fallback.
import net from 'node:net';

const varint = (n) => { const b = []; n >>>= 0; do { let t = n & 0x7f; n >>>= 7; if (n) t |= 0x80; b.push(t); } while (n); return Buffer.from(b); };
const mcStr = (s) => { const b = Buffer.from(s, 'utf8'); return Buffer.concat([varint(b.length), b]); };
const packet = (id, ...parts) => { const body = Buffer.concat([varint(id), ...parts]); return Buffer.concat([varint(body.length), body]); };
function readVarint(buf, off) {
  let n = 0, shift = 0;
  for (let i = 0; i < 5; i++) {
    if (off + i >= buf.length) return null;
    const b = buf[off + i];
    n |= (b & 0x7f) << shift;
    if (!(b & 0x80)) return { v: n, len: i + 1 };
    shift += 7;
  }
  throw new Error('bad varint');
}

/** Handshake (protocol -1, as the vanilla client sends for status) followed by the status request. */
export function handshakeBytes(host, port) {
  const p = Buffer.alloc(2); p.writeUInt16BE(port);
  return Buffer.concat([packet(0, varint(-1), mcStr(host), p, varint(1)), packet(0)]);
}

/**
 * One Server List Ping to `ip:port`, sending `hsHost:hsPort` in the handshake. `ip` must already be resolved and
 * checked by the guard: the socket is opened with a lookup function that throws, so no second DNS lookup can happen.
 * Resolves { ok: true, json, latency } or { ok: false }. Never throws.
 */
export function slp({ ip, port, hsHost, hsPort, connect = net.connect, connectMs = 3000, totalMs = 5000, capBytes = 64 * 1024, now = () => performance.now() }) {
  return new Promise((resolve) => {
    let done = false, buf = Buffer.alloc(0), got = 0, status = null, tReq = 0, tPing = 0, connected = false;
    const sock = connect({ host: ip, port, family: net.isIP(ip), lookup: () => { throw new Error('no lookups'); } });
    const finish = (r) => { if (done) return; done = true; clearTimeout(t1); clearTimeout(t2); try { sock.destroy(); } catch {} resolve(r); };
    const partial = () => (status ? { ok: true, json: status, latency: null } : { ok: false });
    const t1 = setTimeout(() => { if (!connected) finish({ ok: false }); }, connectMs);
    const t2 = setTimeout(() => finish(partial()), totalMs);
    sock.on('connect', () => { connected = true; tReq = now(); sock.write(handshakeBytes(hsHost, hsPort)); });
    sock.on('error', () => finish(partial()));
    sock.on('close', () => finish(partial()));
    sock.on('data', (chunk) => {
      got += chunk.length;
      if (got > capBytes) return finish({ ok: false });
      buf = Buffer.concat([buf, chunk]);
      try {
        for (;;) {
          const len = readVarint(buf, 0);
          if (!len) return;
          if (len.v > capBytes || len.v < 1) return finish({ ok: false });
          if (buf.length < len.len + len.v) return;
          const body = buf.subarray(len.len, len.len + len.v);
          buf = buf.subarray(len.len + len.v);
          const id = readVarint(body, 0);
          if (!id) return finish({ ok: false });
          if (!status && id.v === 0) {
            const sl = readVarint(body, id.len);
            if (!sl || id.len + sl.len + sl.v > body.length) return finish({ ok: false });
            let j;
            try { j = JSON.parse(body.subarray(id.len + sl.len, id.len + sl.len + sl.v).toString('utf8')); } catch { return finish({ ok: false }); }
            if (!j || typeof j !== 'object') return finish({ ok: false });
            status = j;
            status.__rtt = now() - tReq;
            const pl = Buffer.alloc(8); pl.writeBigInt64BE(BigInt(Date.now()));
            tPing = now();
            sock.write(packet(1, pl));
          } else if (status && id.v === 1) {
            return finish({ ok: true, json: status, latency: now() - tPing });
          } else return finish(partial());
        }
      } catch { finish(partial()); }
    });
  });
}

// ---------------------------------------------------------------- status JSON -> safe result
const HEX = { 0: '#000000', 1: '#0000aa', 2: '#00aa00', 3: '#00aaaa', 4: '#aa0000', 5: '#aa00aa', 6: '#ffaa00', 7: '#aaaaaa',
  8: '#555555', 9: '#5555ff', a: '#55ff55', b: '#55ffff', c: '#ff5555', d: '#ff55ff', e: '#ffff55', f: '#ffffff' };
const NAMED = { black: '0', dark_blue: '1', dark_green: '2', dark_aqua: '3', dark_red: '4', dark_purple: '5', gold: '6', gray: '7', grey: '7',
  dark_gray: '8', dark_grey: '8', blue: '9', green: 'a', aqua: 'b', red: 'c', light_purple: 'd', yellow: 'e', white: 'f' };
const FMT = { bold: 'l', italic: 'o', underlined: 'n', strikethrough: 'm', obfuscated: 'k' };
const BLANK = { c: '', l: 0, o: 0, n: 0, m: 0, k: 0 };

/**
 * description (string, text component or array) -> up to 2 lines of segments [{t, c: '#rrggbb'|'', l,o,n,m,k}].
 * Legacy § codes inside text work like the client: a colour clears formats, §r goes back to the component's own style.
 * Segments are plain text: render them with textContent, never as HTML.
 */
export function motdLines(desc, { maxLines = 2, maxChars = 200 } = {}) {
  const lines = [[]];
  let chars = 0, nodes = 0;
  const push = (t, st) => {
    t.split('\n').forEach((part, i) => {
      if (i > 0) lines.push([]);
      if (!part || chars >= maxChars * maxLines) return;
      const take = part.slice(0, maxChars * maxLines - chars);
      chars += take.length;
      const cur = lines[lines.length - 1], last = cur[cur.length - 1];
      const c = st.c ? (st.c[0] === '#' ? st.c : HEX[st.c]) : '';
      if (last && last.c === c && ['l', 'o', 'n', 'm', 'k'].every((f) => last[f] === st[f])) last.t += take;
      else cur.push({ t: take, c, l: st.l, o: st.o, n: st.n, m: st.m, k: st.k });
    });
  };
  const legacy = (text, base) => {
    let st = { ...base }, buf = '';
    const chs = Array.from(text);
    for (let i = 0; i < chs.length; i++) {
      if (chs[i] === '§') {
        if (i + 1 >= chs.length) break;
        const code = chs[++i].toLowerCase();
        if (/[0-9a-f]/.test(code)) { if (buf) push(buf, st); buf = ''; st = { ...BLANK, c: code }; }
        else if (code === 'r') { if (buf) push(buf, st); buf = ''; st = { ...base }; }
        else if (/[lonmk]/.test(code)) { if (buf) push(buf, st); buf = ''; st = { ...st, [code]: 1 }; }
        continue;
      }
      buf += chs[i];
    }
    if (buf) push(buf, st);
  };
  const walk = (node, inh, depth) => {
    if (depth > 12 || ++nodes > 500) return;
    if (typeof node === 'string' || typeof node === 'number' || typeof node === 'boolean') return legacy(String(node), inh);
    if (Array.isArray(node)) {
      if (!node.length) return;
      const [first, ...rest] = node;
      const parent = first && typeof first === 'object' && !Array.isArray(first) ? { ...first } : { text: first };
      parent.extra = [...(Array.isArray(parent.extra) ? parent.extra : []), ...rest];
      return walk(parent, inh, depth + 1);
    }
    if (!node || typeof node !== 'object') return;
    const st = { ...inh };
    if (typeof node.color === 'string') {
      const col = node.color.toLowerCase();
      if (NAMED[col]) st.c = NAMED[col];
      else if (/^#[0-9a-f]{6}$/.test(col)) st.c = col;
      else if (col === 'reset') st.c = '';
    }
    for (const [k, f] of Object.entries(FMT)) if (typeof node[k] === 'boolean') st[f] = node[k] ? 1 : 0;
    if (typeof node.text === 'string' || typeof node.text === 'number') legacy(String(node.text), st);
    else if (typeof node.translate === 'string') legacy(typeof node.fallback === 'string' ? node.fallback : node.translate, st);
    if (Array.isArray(node.extra)) node.extra.forEach((x) => walk(x, st, depth + 1));
  };
  walk(desc, { ...BLANK }, 0);
  return lines.slice(0, maxLines).map((segs) => segs.filter((s) => s.t)); // the server list shows two lines
}

const stripCodes = (s) => String(s).replace(/§./gs, '').replace(/§/g, '');
const intOr = (v, max = 1e7) => (Number.isInteger(v) && v >= 0 && v <= max ? v : undefined);

/** Status JSON -> only the fields we show. No player sample; favicon only as a PNG data URI <= 16 KB. */
export function safeResult(json, latency) {
  const out = {};
  if (json.version && typeof json.version === 'object') {
    if (typeof json.version.name === 'string') out.version_name = stripCodes(json.version.name).trim().slice(0, 80);
    if (Number.isInteger(json.version.protocol)) out.protocol = json.version.protocol;
  }
  if (json.players && typeof json.players === 'object') {
    const on = intOr(json.players.online), mx = intOr(json.players.max);
    if (on !== undefined) out.players_online = on;
    if (mx !== undefined) out.players_max = mx;
  }
  out.motd = motdLines(json.description ?? '');
  if (typeof json.favicon === 'string') {
    const f = json.favicon.replace(/[\r\n]/g, '');
    if (f.length <= 16 * 1024 && /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(f)) out.favicon = f;
  }
  const lat = latency ?? json.__rtt;
  if (typeof lat === 'number' && Number.isFinite(lat)) out.latency_ms = Math.max(1, Math.round(lat));
  return out;
}
