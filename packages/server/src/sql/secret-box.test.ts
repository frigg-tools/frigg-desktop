import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFileSecretBox } from './secret-box.ts';

describe('file secret box', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'frigg-secret-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('round-trips a secret', () => {
    const box = createFileSecretBox(join(dir, 'k.key'));
    const blob = box.encrypt('hunter2');
    expect(blob).not.toContain('hunter2');
    expect(box.decrypt(blob)).toBe('hunter2');
  });

  it('reuses the persisted key across instances', () => {
    const keyPath = join(dir, 'k.key');
    const blob = createFileSecretBox(keyPath).encrypt('s3cr3t');
    expect(createFileSecretBox(keyPath).decrypt(blob)).toBe('s3cr3t');
  });

  it('rejects a tampered blob', () => {
    const box = createFileSecretBox(join(dir, 'k.key'));
    const blob = box.encrypt('x');
    const tampered = Buffer.from(blob, 'base64');
    tampered[tampered.length - 1] ^= 0xff;
    expect(() => box.decrypt(tampered.toString('base64'))).toThrow();
  });
});
