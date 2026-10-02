// Protects the server from being used to probe private networks (SSRF):
// user-supplied URLs may only resolve to public internet addresses.
import net from 'node:net';
import dns from 'node:dns';

const blocked = new net.BlockList();
for (const [prefix, bits] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
]) {
  blocked.addSubnet(prefix, bits, 'ipv4');
}
for (const [prefix, bits] of [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['100::', 64],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
]) {
  blocked.addSubnet(prefix, bits, 'ipv6');
}

function mappedIpv4(ip) {
  const lower = ip.toLowerCase();
  const dotted = lower.match(/^(?:0*:)*:?ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) return dotted[1];
  const hex = lower.match(/^(?:0*:)*:?ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const hi = parseInt(hex[1], 16);
    const lo = parseInt(hex[2], 16);
    return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  }
  return null;
}

export function isPrivateAddress(ip) {
  const family = net.isIP(ip);
  if (family === 4) return blocked.check(ip, 'ipv4');
  if (family === 6) {
    const v4 = mappedIpv4(ip);
    if (v4) return blocked.check(v4, 'ipv4');
    return blocked.check(ip, 'ipv6');
  }
  return true;
}

export class PrivateAddressError extends Error {
  constructor(host) {
    super(`${host} resolves to a private or reserved address`);
    this.code = 'EPRIVATE';
  }
}

// A drop-in replacement for dns.lookup that refuses private addresses.
export function safeLookup(allowPrivate = false) {
  return (hostname, options, callback) => {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
      if (err) return callback(err);
      const usable = allowPrivate ? addresses : addresses.filter((a) => !isPrivateAddress(a.address));
      if (!usable.length) return callback(new PrivateAddressError(hostname));
      if (options.all) return callback(null, usable);
      return callback(null, usable[0].address, usable[0].family);
    });
  };
}

export function assertPublicHost(hostname, allowPrivate = false) {
  const bare = hostname.replace(/^\[|\]$/g, '');
  if (!allowPrivate && net.isIP(bare) && isPrivateAddress(bare)) throw new PrivateAddressError(hostname);
}
