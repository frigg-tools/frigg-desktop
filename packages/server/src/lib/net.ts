import os from 'node:os';

const VIRTUAL_INTERFACE_PREFIXES = [
  'utun',
  'tun',
  'tap',
  'ppp',
  'ipsec',
  'bridge',
  'vmenet',
  'vnic',
  'awdl',
  'llw',
  'docker',
  'veth',
  'virbr',
];

function isVirtualInterface(name: string): boolean {
  const lower = name.toLowerCase();
  return VIRTUAL_INTERFACE_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

function isPrivateIpv4(address: string): boolean {
  if (address.startsWith('192.168.') || address.startsWith('10.')) return true;
  const match = address.match(/^172\.(\d+)\./);
  if (match) {
    const second = Number(match[1]);
    return second >= 16 && second <= 31;
  }
  return false;
}

export function getLanIp(): string | null {
  const candidates: string[] = [];
  for (const [name, addresses] of Object.entries(os.networkInterfaces())) {
    if (!addresses || isVirtualInterface(name)) continue;
    for (const address of addresses) {
      if (address.family === 'IPv4' && !address.internal) {
        candidates.push(address.address);
      }
    }
  }
  return candidates.find(isPrivateIpv4) ?? candidates[0] ?? null;
}
