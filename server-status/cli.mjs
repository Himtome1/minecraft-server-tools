#!/usr/bin/env node
// Usage: node server-status/cli.mjs play.example.com[:port]
//    or: node --env-file=server-status/.env server-status/cli.mjs play.example.com
// Prints the check result as JSON (the same shape an HTTP endpoint would return).
import { makeStatusChecker } from './checker.mjs';

const address = process.argv[2];
if (!address) {
  console.error('Usage: node server-status/cli.mjs <host[:port]>');
  process.exit(2);
}
let checker;
try {
  checker = makeStatusChecker({ blockIps: process.env.TOOLS_BLOCK_IPS || '', ipv6: process.env.TOOLS_IPV6 === '1' });
} catch (e) {
  console.error(`${e.message}\nSet TOOLS_BLOCK_IPS to your own IPs/CIDRs (or leave it empty); see .env.example.`);
  process.exit(2);
}
const r = await checker.check('cli', address);
console.log(JSON.stringify(r.body, null, 2));
process.exit(r.body.status === 'online' ? 0 : 1);
