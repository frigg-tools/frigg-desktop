import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const friggDir = path.join(os.homedir(), '.frigg');
export const caKeyPath = path.join(friggDir, 'ca', 'ca.key');
export const caCertPath = path.join(friggDir, 'ca', 'ca.pem');
export const mocksPath = path.join(friggDir, 'mocks.json');
export const apiClientPath = path.join(friggDir, 'api-client.json');
export const proxyCertsPath = path.join(friggDir, 'proxy-certs.json');
export const automationsPath = path.join(friggDir, 'automations.json');
export const automationRunsPath = path.join(friggDir, 'automation-runs');
export const automationReferencesPath = path.join(friggDir, 'automation-references');
export const sqlConnectionsPath = path.join(friggDir, 'sql-connections.json');
export const sqlSecretsPath = path.join(friggDir, 'sql-secrets.json');
export const sqlSecretKeyPath = path.join(friggDir, 'sql-secret.key');

export function logsPath(): string {
  return path.join(friggDir, 'logs');
}

export function ensureFriggDirs(): void {
  fs.mkdirSync(path.join(friggDir, 'ca'), { recursive: true });
}
