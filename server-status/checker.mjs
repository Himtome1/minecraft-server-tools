// Server status check: parse -> SRV (like the vanilla client) -> resolve once -> guard -> one Server List Ping.
// Results never carry a resolved IP. Nothing here logs the address.
import net from 'node:net';
import dns from 'node:dns';
import { parseAddress, portOk } from './address.mjs';
import { makeBlockList, isBlocked } from './guard.mjs';
import { slp, safeResult } from './ping.mjs';
import { makeLimiter } from './limiter.mjs';

export const MSG = {
  invalid: "That doesn't look like a server address. Use a name like play.example.com or play.example.com:25566.",
  port: "That port isn't a Minecraft port we can check.",
  blocked: "We can't check that address.",
  rate_limited: 'Too many checks, try again in a minute.',
  notFound: "We couldn't find that address. Check the spelling.",
};

/**
 * deps (all optional): {
 *   blockIps: infra IPs/CIDRs string (TOOLS_BLOCK_IPS), blockList: a ready net.BlockList (overrides blockIps),
 *   ipv6: allow IPv6 targets, lookup(host) -> [ip], resolveSrv(name) -> [{name, port}], connect, nowMs, limits
 * }
 * check(clientId, rawAddress) -> { httpStatus, body }
 */
export function makeStatusChecker(deps = {}) {
  const bl = deps.blockList || makeBlockList(deps.blockIps || '');
  const ipv6 = !!deps.ipv6;
  const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms).unref?.())]);
  const resolver = new dns.promises.Resolver({ timeout: 2000, tries: 1 });
  const lookup = deps.lookup || (async (host) => (await withTimeout(dns.promises.lookup(host, { all: true, family: ipv6 ? 0 : 4 }), 3000)).map((a) => a.address));
  const resolveSrv = deps.resolveSrv || ((name) => withTimeout(resolver.resolveSrv(name), 2500));
  const connect = deps.connect || net.connect;
  const lim = makeLimiter({ nowMs: deps.nowMs, ...(deps.limits || {}) });
  const iso = (t) => new Date(t).toISOString();

  async function run(p) {
    const base = { host: p.host, port: p.port };
    let target = p.host, port = p.port, hsHost = p.host, srv = false;
    // SRV the way the vanilla client does it: only for port 25565 and names (not IP literals); the first record wins,
    // and the handshake then carries the SRV target host and port.
    if (p.port === 25565 && !net.isIP(p.host)) {
      try {
        const recs = await resolveSrv(`_minecraft._tcp.${p.host}`);
        if (recs && recs.length && recs[0].name) {
          target = String(recs[0].name).toLowerCase().replace(/\.$/, '');
          port = Number(recs[0].port);
          hsHost = target; srv = true;
          if (!portOk(port)) return { ...base, status: 'invalid', srv, message: MSG.port };
        }
      } catch { /* no SRV record: use the name as typed */ }
    }
    // Resolve once; connect to exactly this IP (no second lookup, so no DNS rebinding).
    let ips;
    if (net.isIP(target)) ips = [target];
    else {
      try { ips = await lookup(target); } catch { ips = []; }
      if (!ips.length) return { ...base, status: 'offline', srv, message: MSG.notFound };
    }
    if (ips.some((ip) => isBlocked(bl, ip))) return { ...base, status: 'blocked', srv, message: MSG.blocked };
    const ip = ips.find((x) => net.isIP(x) === 4) ?? (ipv6 ? ips[0] : null);
    if (!ip) return { ...base, status: 'offline', srv };
    const r = await slp({ ip, port, hsHost, hsPort: port, connect });
    if (!r.ok) return { ...base, status: 'offline', srv };
    return { ...base, status: 'online', srv, ...safeResult(r.json, r.latency) };
  }

  async function check(clientId, raw) {
    const t = lim.now();
    const key = String(clientId || 'unknown');
    if (!lim.admit(key, t)) return { httpStatus: 429, body: { status: 'rate_limited', message: MSG.rate_limited, checked_at: iso(t) } };
    const p = parseAddress(raw);
    if (p.error) return { httpStatus: 200, body: { status: 'invalid', message: p.error === 'port' ? MSG.port : MSG.invalid, checked_at: iso(t) } };
    const ck = `${p.host}:${p.explicitPort ? p.port : 'default'}`;
    const hit = lim.cached(ck, t);
    if (hit) return { httpStatus: 200, body: { ...hit.result, cached: true, age_s: Math.floor((t - hit.at) / 1000), checked_at: iso(hit.at) } };
    if (!lim.takeGlobal(t)) return { httpStatus: 429, body: { status: 'rate_limited', message: MSG.rate_limited, checked_at: iso(t) } };
    lim.start(key);
    try {
      const result = await run(p);
      const at = lim.now();
      lim.store(ck, result, at);
      return { httpStatus: 200, body: { ...result, cached: false, age_s: 0, checked_at: iso(at) } };
    } catch {
      return { httpStatus: 200, body: { host: p.host, port: p.port, status: 'offline', checked_at: iso(t) } };
    } finally { lim.end(key); }
  }
  return { check };
}
