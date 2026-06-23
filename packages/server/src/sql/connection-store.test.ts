import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SqlConnectionStore } from './connection-store.ts';

const input = { name: 'local', engine: 'postgres' as const, host: 'localhost',
  port: 5432, user: 'me', database: 'app', ssl: 'disable' as const };

describe('SqlConnectionStore', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'frigg-conn-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('creates, updates and deletes, persisting across loads', async () => {
    const store = await SqlConnectionStore.load(join(dir, 'c.json'));
    const conn = store.create(input);
    expect(conn.id).toBeTruthy();
    store.update(conn.id, { name: 'renamed' });
    await store.flush();
    const reloaded = await SqlConnectionStore.load(join(dir, 'c.json'));
    expect(reloaded.get(conn.id)?.name).toBe('renamed');
    reloaded.delete(conn.id);
    expect(reloaded.get(conn.id)).toBeUndefined();
  });

  it('derives hasPassword from the predicate', async () => {
    const store = await SqlConnectionStore.load(join(dir, 'c.json'));
    const conn = store.create(input);
    store.setHasPassword((id) => id === conn.id);
    expect(store.list().find((c) => c.id === conn.id)?.hasPassword).toBe(true);
  });

  it('emits on mutation', async () => {
    const store = await SqlConnectionStore.load(join(dir, 'c.json'));
    let events = 0;
    store.on('event', () => { events += 1; });
    store.create(input);
    expect(events).toBe(1);
  });
});
