// The fake Minecraft server below speaks the real Server List Ping on 127.0.0.1.
// Only loopback, private and documentation addresses appear in these tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { parseAddress } from '../address.mjs';
import { makeBlockList, isBlocked } from '../guard.mjs';
import { motdLines, safeResult, handshakeBytes } from '../ping.mjs';
import { makeStatusChecker } from '../checker.mjs';
import { makeLimiter } from '../limiter.mjs';

// Stands in for a public server address. It's a documentation address, so the "online" tests use a block list
// without the special-purpose ranges; the socket itself always goes to the fake server on 127.0.0.1.
const SERVER_IP = '203.0.113.10';

function readVarint(buf, off) { let n = 0, s = 0; for (let i = 0; i < 5; i++) { const b = buf[off + i]; if (b === undefined) return null; n |= (b & 0x7f) << s; if (!(b & 0x80)) return { v: n, len: i + 1 }; s += 7; } return null; }
const vi = (n) => { const b = []; n >>>= 0; do { let t = n & 0x7f; n >>>= 7; if (n) t |= 0x80; b.push(t); } while (n); return Buffer.from(b); };
const pkt = (id, body) => { const b = Buffer.concat([vi(id), body]); return Buffer.concat([vi(b.length), b]); };

/** Fake server: answers status with `status` JSON and echoes the ping. Records the handshake host/port. */
function fakeServer(status, { raw = null } = {}) {
  const seen = [];
  const srv = net.createServer((s) => {
    let buf = Buffer.alloc(0), n = 0;
    s.on('error', () => {});
    s.on('data', (c) => {
      buf = Buffer.concat([buf, c]);
      for (;;) {
        const L = readVarint(buf, 0); if (!L || buf.length < L.len + L.v) return;
        const body = buf.subarray(L.len, L.len + L.v); buf = buf.subarray(L.len + L.v);
        const id = readVarint(body, 0).v; n++;
        if (n === 1) {
          let o = readVarint(body, 0).len; o += readVarint(body, o).len;
          const hl = readVarint(body, o); const host = body.subarray(o + hl.len, o + hl.len + hl.v).toString(); o += hl.len + hl.v;
          seen.push({ host, port: body.readUInt16BE(o), next: body[o + 2] });
        } else if (n === 2 && id === 0) {
          if (raw) { s.write(raw); continue; }
          const j = Buffer.from(JSON.stringify(status)); s.write(pkt(0, Buffer.concat([vi(j.length), j])));
        } else if (id === 1) s.write(pkt(1, body.subarray(1)));
      }
    });
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r({ srv, port: srv.address().port, seen })));
}

function checker(port, extra = {}) {
  const calls = [];
  const c = makeStatusChecker({
    blockList: extra.blockList ?? makeBlockList('203.0.113.99', { reserved: false }),
    lookup: async (h) => (extra.dns?.[h] ?? [SERVER_IP]),
    resolveSrv: async (n) => { if (extra.srv?.[n]) return extra.srv[n]; throw Object.assign(new Error('nodata'), { code: 'ENODATA' }); },
    connect: (o) => { calls.push(o); return net.connect({ host: '127.0.0.1', port }); },
    ...extra.deps,
  });
  return { c, calls };
}

const STATUS = {
  version: { name: 'Paper 1.21.1', protocol: 767 },
  players: { online: 2, max: 20, sample: [{ name: '<b>evil</b>', id: '00000000-0000-0000-0000-000000000000' }] },
  description: { text: '', extra: [{ text: 'Hello ', color: 'gold', bold: true }, { text: '<script>alert(1)</script>', color: '#12abef' }, '\n§aline two §lbold'] },
  favicon: 'data:image/png;base64,iVBORw0KGgo=',
};

test('parseAddress: forms, ports and limits', () => {
  assert.deepEqual(parseAddress('  Play.Example.com '), { host: 'play.example.com', port: 25565, explicitPort: false });
  assert.deepEqual(parseAddress('minecraft://mc.example.com:25566'), { host: 'mc.example.com', port: 25566, explicitPort: true });
  assert.deepEqual(parseAddress('https://mc.example.com/'), { host: 'mc.example.com', port: 25565, explicitPort: false });
  assert.deepEqual(parseAddress('[::1]:25565'), { host: '::1', port: 25565, explicitPort: true });
  for (const a of ['example.com:22', 'example.com:80', 'example.com:70000']) assert.equal(parseAddress(a).error, 'port', a);
  assert.equal(parseAddress('example.com:1024').port, 1024);
  for (const a of ['', 'bad host!', 'a'.repeat(254), '-x.example.com']) assert.equal(parseAddress(a).error, 'invalid', a);
});

test('guard: special-purpose ranges are refused, IPv6 public allowed', () => {
  const bl = makeBlockList();
  for (const ip of ['127.0.0.1', '10.0.0.1', '172.16.5.5', '192.168.1.1', '100.64.0.1', '169.254.169.254', '0.0.0.0', '224.0.0.1', '255.255.255.255',
    '192.0.2.1', '198.51.100.1', '203.0.113.1', '::1', '::', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '64:ff9b::7f00:1', '2002:7f00:1::', '2001:db8::1'])
    assert.equal(isBlocked(bl, ip), true, ip);
  assert.equal(isBlocked(bl, '2606:4700:4700::1111'), false);
  assert.equal(isBlocked(bl, 'not-an-ip'), true);
});

test('guard: infra list from env, single IPs and CIDRs', () => {
  const bl = makeBlockList('203.0.113.9, 198.51.100.0/28 2606:4700:4700::1111', { reserved: false });
  assert.equal(isBlocked(bl, '203.0.113.9'), true);
  assert.equal(isBlocked(bl, '203.0.113.10'), false);
  assert.equal(isBlocked(bl, '198.51.100.15'), true);
  assert.equal(isBlocked(bl, '198.51.100.16'), false);
  assert.equal(isBlocked(bl, '2606:4700:4700::1111'), true);
  assert.throws(() => makeBlockList('<INFRA_IPS>'), /not an IP/);
});

test('blocked addresses never open a connection', async () => {
  const { c, calls } = checker(1, {
    blockList: makeBlockList('198.51.100.7'),
    dns: { 'loop.example.com': ['127.0.0.1'], 'mixed.example.com': ['203.0.113.10', '10.1.2.3'], 'six.example.com': ['::1'] },
  });
  for (const a of ['127.0.0.1', '10.0.0.1', '[::1]', '::1', '198.51.100.7:25566', 'loop.example.com', 'mixed.example.com', 'six.example.com']) {
    const r = await c.check(`client-${a}`, a);
    assert.equal(r.body.status, 'blocked', a);
    assert.equal(r.body.message, "We can't check that address.");
  }
  assert.equal(calls.length, 0);
});

test('online: SRV target goes in the handshake, no IP or player sample in the reply, favicon kept', async () => {
  const f = await fakeServer(STATUS);
  try {
    const { c, calls } = checker(f.port, { srv: { '_minecraft._tcp.play.example.com': [{ name: 'mc1.example.net.', port: 25570, priority: 0, weight: 0 }] } });
    const r = await c.check('c1', 'play.example.com');
    assert.equal(r.httpStatus, 200);
    assert.equal(r.body.status, 'online');
    assert.equal(r.body.srv, true);
    assert.deepEqual(f.seen[0], { host: 'mc1.example.net', port: 25570, next: 1 });
    assert.equal(calls[0].host, SERVER_IP); // connected to the looked-up IP itself
    assert.throws(() => calls[0].lookup()); // and the socket can't do its own lookup
    assert.equal(r.body.version_name, 'Paper 1.21.1');
    assert.equal(r.body.players_online, 2); assert.equal(r.body.players_max, 20);
    assert.equal(r.body.favicon, STATUS.favicon);
    assert.equal(typeof r.body.latency_ms, 'number');
    const s = JSON.stringify(r.body);
    assert.doesNotMatch(s, /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/);
    assert.doesNotMatch(s, /evil|sample/);
    assert.equal(r.body.motd[0].map((x) => x.t).join(''), 'Hello <script>alert(1)</script>');
    assert.equal(r.body.motd[0][1].c, '#12abef');
    // no SRV record and no port: the handshake carries the name as typed
    const r2 = await c.check('c2', 'mc.example.org');
    assert.equal(r2.body.srv, false);
    assert.deepEqual(f.seen[1], { host: 'mc.example.org', port: 25565, next: 1 });
    // explicit non-default port: no SRV lookup (vanilla only looks up SRV for 25565)
    const r3 = await c.check('c3', 'play.example.com:25599');
    assert.equal(r3.body.srv, false);
    assert.deepEqual(f.seen[2], { host: 'play.example.com', port: 25599, next: 1 });
  } finally { f.srv.close(); }
});

test('offline: closed port, junk reply, unknown name', async () => {
  const closed = await new Promise((r) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
  const { c } = checker(closed, { dns: { 'nope.example.com': [] } });
  assert.equal((await c.check('d1', 'gone.example.com')).body.status, 'offline');
  const r = await c.check('d2', 'nope.example.com');
  assert.equal(r.body.status, 'offline'); assert.match(r.body.message, /couldn't find/);
  const f = await fakeServer(null, { raw: Buffer.from([0x05, 0x00, 0x7f, 0x7b, 0x7b, 0x7b]) });
  try { assert.equal((await checker(f.port).c.check('d3', 'junk.example.com')).body.status, 'offline'); } finally { f.srv.close(); }
});

test('64 KB cap: an oversized reply is offline', async () => {
  const f = await fakeServer({ ...STATUS, description: 'x'.repeat(70 * 1024) });
  try { assert.equal((await checker(f.port).c.check('e1', 'big.example.com')).body.status, 'offline'); } finally { f.srv.close(); }
});

test('rate limits: 11th check in a minute is 429, one at a time, cache says how old', async () => {
  const f = await fakeServer(STATUS);
  try {
    let t = 1_000_000;
    const { c } = checker(f.port, { deps: { nowMs: () => t } });
    assert.equal((await c.check('r1', 'a.example.com')).body.cached, false);
    t += 7000;
    const again = await c.check('r1', 'a.example.com');
    assert.equal(again.body.cached, true); assert.equal(again.body.age_s, 7);
    for (let i = 0; i < 8; i++) assert.equal((await c.check('r1', 'a.example.com:2000' + i)).httpStatus, 200);
    const eleventh = await c.check('r1', 'a.example.com');
    assert.equal(eleventh.httpStatus, 429); assert.equal(eleventh.body.status, 'rate_limited');
    t += 61_000;
    assert.equal((await c.check('r1', 'a.example.com')).httpStatus, 200);
    const p1 = c.check('r2', 'b.example.com');
    assert.equal((await c.check('r2', 'c.example.com')).httpStatus, 429);
    assert.equal((await p1).body.status, 'online');
  } finally { f.srv.close(); }
});

test('global cap counts network checks only', async () => {
  const f = await fakeServer(STATUS);
  try {
    const { c } = checker(f.port, { deps: { limits: { global: 3 } } });
    for (let i = 0; i < 3; i++) assert.equal((await c.check(`g${i}`, `g${i}.example.com`)).httpStatus, 200);
    assert.equal((await c.check('g9', 'g9.example.com')).httpStatus, 429);
    assert.equal((await c.check('g8', 'g0.example.com')).body.cached, true);
  } finally { f.srv.close(); }
});

test('limiter: window slides', () => {
  let t = 0;
  const lim = makeLimiter({ perClient: 2, windowMs: 1000, nowMs: () => t });
  assert.equal(lim.admit('x'), true); assert.equal(lim.admit('x'), true); assert.equal(lim.admit('x'), false);
  t = 1000; assert.equal(lim.admit('x'), true);
});

test('motdLines: legacy rules, hex, text kept as text; safeResult filters', () => {
  const l = motdLines('§c§lHi §aGreen\n§rplain <img src=x onerror=alert(1)>');
  assert.deepEqual(l[0], [{ t: 'Hi ', c: '#ff5555', l: 1, o: 0, n: 0, m: 0, k: 0 }, { t: 'Green', c: '#55ff55', l: 0, o: 0, n: 0, m: 0, k: 0 }]);
  assert.equal(l[1][0].t, 'plain <img src=x onerror=alert(1)>'); assert.equal(l[1][0].c, '');
  assert.equal(motdLines('a\nb\nc').length, 2);
  assert.equal(motdLines([{ text: 'A', color: 'red' }, 'B'])[0][0].t, 'AB');
  assert.equal(motdLines({ text: 'x', color: 'javascript:alert(1)' })[0][0].c, '');
  assert.equal(safeResult({ description: 'x', favicon: 'data:image/svg+xml;base64,AAAA' }, 5).favicon, undefined);
  assert.equal(safeResult({ favicon: 'data:image/png;base64,' + 'A'.repeat(17000) }).favicon, undefined);
  assert.equal(safeResult({ version: { name: '§aPaper §l1.21' } }).version_name, 'Paper 1.21');
});

test('handshake bytes: protocol -1, host, port, next state 1, then status request', () => {
  assert.deepEqual([...handshakeBytes('a.b', 25565)], [0x0d, 0x00, 0xff, 0xff, 0xff, 0xff, 0x0f, 0x03, 0x61, 0x2e, 0x62, 0x63, 0xdd, 0x01, 0x01, 0x00]);
});
