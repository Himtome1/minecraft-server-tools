// Address parsing: `host` or `host:port`, the way players type it into the Minecraft server list.
import net from 'node:net';

/** Ports we check: 25565 and the unprivileged range. */
export const portOk = (p) => Number.isInteger(p) && (p === 25565 || (p >= 1024 && p <= 65535));

/**
 * Trims, lowercases, strips a leading minecraft:// or http(s):// and anything after / ? #.
 * Returns { host, port, explicitPort } or { error: 'invalid' | 'port' }.
 */
export function parseAddress(raw) {
  let s = String(raw ?? '').trim().toLowerCase();
  s = s.replace(/^(minecraft|https?):\/\//, '').replace(/[/?#].*$/, '');
  if (!s || s.length > 253 + 8) return { error: 'invalid' };
  let host, port, m;
  if ((m = /^\[([0-9a-f:.]+)\](?::(\d{1,5}))?$/.exec(s))) { host = m[1]; port = m[2]; }
  else if ((s.match(/:/g) || []).length > 1) host = s; // bare IPv6 literal, no port
  else if ((m = /^([^:]+)(?::(\d{1,5}))?$/.exec(s))) { host = m[1]; port = m[2]; }
  else return { error: 'invalid' };
  host = host.replace(/\.$/, '');
  if (!host || host.length > 253) return { error: 'invalid' };
  if (!net.isIP(host)) {
    const labels = host.split('.');
    if (!labels.every((l) => /^[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?$/.test(l))) return { error: 'invalid' };
  } else if (net.isIP(host) === 6 && s[0] !== '[' && port) return { error: 'invalid' };
  const explicitPort = port !== undefined;
  const p = explicitPort ? Number(port) : 25565;
  if (!portOk(p)) return { error: 'port' };
  return { host, port: p, explicitPort };
}
