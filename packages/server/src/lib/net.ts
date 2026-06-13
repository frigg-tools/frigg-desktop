import os from 'node:os';

export function getLanIp(): string | null {
  for (const addresses of Object.values(os.networkInterfaces())) {
    if (!addresses) continue;
    for (const address of addresses) {
      if (address.family === 'IPv4' && !address.internal) {
        return address.address;
      }
    }
  }
  return null;
}
