import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const friggDir = path.join(os.homedir(), '.frigg');
export const caKeyPath = path.join(friggDir, 'ca', 'ca.key');
export const caCertPath = path.join(friggDir, 'ca', 'ca.pem');
export const mocksPath = path.join(friggDir, 'mocks.json');

export function ensureFriggDirs(): void {
  fs.mkdirSync(path.join(friggDir, 'ca'), { recursive: true });
}
