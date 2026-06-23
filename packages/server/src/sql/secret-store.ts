import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { SecretBox } from './secret-box.ts';

export class SqlSecretStore {
  private blobs = new Map<string, string>();
  private constructor(private readonly filePath: string, private readonly box: SecretBox) {}

  static async load(filePath: string, box: SecretBox): Promise<SqlSecretStore> {
    const store = new SqlSecretStore(filePath, box);
    await mkdir(dirname(filePath), { recursive: true });
    try {
      const parsed = JSON.parse(await readFile(filePath, 'utf8')) as Record<string, string>;
      for (const [id, blob] of Object.entries(parsed)) {
        if (typeof blob === 'string') store.blobs.set(id, blob);
      }
    } catch { /* start empty */ }
    return store;
  }

  has(id: string): boolean { return this.blobs.has(id); }

  get(id: string): string | null {
    const blob = this.blobs.get(id);
    if (blob === undefined) return null;
    try { return this.box.decrypt(blob); } catch { return null; }
  }

  async set(id: string, password: string): Promise<void> {
    this.blobs.set(id, this.box.encrypt(password));
    await this.persist();
  }

  async delete(id: string): Promise<void> {
    if (this.blobs.delete(id)) await this.persist();
  }

  private async persist(): Promise<void> {
    const payload = JSON.stringify(Object.fromEntries(this.blobs), null, 2);
    const tmp = `${this.filePath}.${randomUUID()}.tmp`;
    await writeFile(tmp, payload, 'utf8');
    await rename(tmp, this.filePath);
  }
}
