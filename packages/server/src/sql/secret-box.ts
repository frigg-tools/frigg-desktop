import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface SecretBox {
  encrypt(plain: string): string;
  decrypt(blob: string): string;
}

function loadOrCreateKey(keyPath: string): Buffer {
  if (existsSync(keyPath)) return readFileSync(keyPath);
  mkdirSync(dirname(keyPath), { recursive: true });
  const key = randomBytes(32);
  writeFileSync(keyPath, key, { mode: 0o600 });
  chmodSync(keyPath, 0o600);
  return key;
}

export function createFileSecretBox(keyPath: string): SecretBox {
  const key = loadOrCreateKey(keyPath);
  return {
    encrypt(plain) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64');
    },
    decrypt(blob) {
      const buf = Buffer.from(blob, 'base64');
      const iv = buf.subarray(0, 12);
      const tag = buf.subarray(12, 28);
      const enc = buf.subarray(28);
      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
    },
  };
}
