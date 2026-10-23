// SSRF guard: every resolved address is checked here BEFORE any connection is opened.
// Refused: loopback, private, CGNAT, link-local, multicast, reserved/documentation ranges, IPv6 ULA/link-local/loopback,
// IPv4-mapped and NAT64 forms, plus your own infrastructure from the TOOLS_BLOCK_IPS env variable.
import net from 'node:net';

// IANA special-purpose ranges (RFC 6890 and friends).
const V4 = ['0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8', '169.254.0.0/16', '172.16.0.0/12', '192.0.0.0/24', '192.0.2.0/24',
  '192.88.99.0/24', '192.168.0.0/16', '198.18.0.0/15', '198.51.100.0/24', '203.0.113.0/24', '224.0.0.0/4', '240.0.0.0/4'];
// ::ffff:0:0/96 (IPv4-mapped) is refused in isBlocked(): in net.BlockList that rule would also match every IPv4 address.
const V6 = ['::/128', '::1/128', '64:ff9b::/96', '64:ff9b:1::/48', '100::/64', '2001::/23', '2001:db8::/32', '2002::/16',
  'fc00::/7', 'fe80::/10', 'fec0::/10', 'ff00::/8'];

/**
 * extra: your infrastructure IPs/CIDRs (comma or space separated), e.g. process.env.TOOLS_BLOCK_IPS.
 * opts.reserved = false leaves out the special-purpose ranges (tests only).
 */
export function makeBlockList(extra = '', { reserved = true } = {}) {
  const bl = new net.BlockList();
  const add = (cidr) => {
    const [a, pre] = cidr.split('/');
    const fam = net.isIP(a);
    if (!fam) throw new Error(`TOOLS_BLOCK_IPS: not an IP or CIDR: ${cidr.length > 12 ? cidr.slice(0, 12) + '…' : cidr}`);
    const type = fam === 6 ? 'ipv6' : 'ipv4';
    if (pre === undefined) bl.addAddress(a, type); else bl.addSubnet(a, Number(pre), type);
  };
  if (reserved) [...V4, ...V6].forEach(add);
  String(extra).split(/[\s,]+/).filter(Boolean).forEach(add);
  return bl;
}

const MAPPED = new net.BlockList();
MAPPED.addSubnet('::ffff:0:0', 96, 'ipv6');

/** true = never connect to this IP. Anything that isn't an IP literal is refused too. */
export function isBlocked(bl, ip) {
  const fam = net.isIP(ip);
  if (!fam) return true;
  if (fam === 6 && MAPPED.check(ip, 'ipv6')) return true;
  return bl.check(ip, fam === 6 ? 'ipv6' : 'ipv4');
}
