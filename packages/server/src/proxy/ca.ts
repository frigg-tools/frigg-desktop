import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { generateCACertificate } from 'mockttp';
import { caCertPath, caKeyPath, ensureFriggDirs } from '../lib/paths.ts';

const execFileAsync = promisify(execFile);

export interface CaMaterial {
  key: string;
  cert: string;
  fingerprint: string;
}

export async function ensureCa(): Promise<CaMaterial> {
  ensureFriggDirs();
  const existing = await loadPersistedCa();
  if (existing) return existing;
  const generated = await generateCACertificate({ subject: { commonName: 'Frigg CA' } });
  await fs.writeFile(caKeyPath, generated.key, { mode: 0o600 });
  await fs.writeFile(caCertPath, generated.cert);
  return {
    key: generated.key,
    cert: generated.cert,
    fingerprint: certFingerprint(generated.cert),
  };
}

async function loadPersistedCa(): Promise<CaMaterial | null> {
  try {
    const [key, cert] = await Promise.all([
      fs.readFile(caKeyPath, 'utf8'),
      fs.readFile(caCertPath, 'utf8'),
    ]);
    if (!key.trim() || !cert.trim()) return null;
    return { key, cert, fingerprint: certFingerprint(cert) };
  } catch {
    return null;
  }
}

export function certToDer(certPem: string): Buffer {
  const base64 = certPem
    .replace(/-----BEGIN CERTIFICATE-----/g, '')
    .replace(/-----END CERTIFICATE-----/g, '')
    .replace(/\s+/g, '');
  return Buffer.from(base64, 'base64');
}

function certFingerprint(certPem: string): string {
  const digest = createHash('sha256').update(certToDer(certPem)).digest('hex').toUpperCase();
  const pairs: string[] = [];
  for (let i = 0; i < digest.length; i += 2) {
    pairs.push(digest.slice(i, i + 2));
  }
  return pairs.join(':');
}

export async function androidCertName(certPem: string): Promise<string> {
  const tmpCertPath = path.join(os.tmpdir(), `frigg-ca-${randomUUID()}.pem`);
  await fs.writeFile(tmpCertPath, certPem);
  try {
    const { stdout } = await execFileAsync('openssl', [
      'x509',
      '-subject_hash_old',
      '-noout',
      '-in',
      tmpCertPath,
    ]);
    const hash = stdout.trim();
    if (!/^[0-9a-f]{8}$/i.test(hash)) {
      throw new Error(`unexpected openssl subject_hash_old output: ${hash}`);
    }
    return `${hash}.0`;
  } finally {
    await fs.rm(tmpCertPath, { force: true });
  }
}
