import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { AutomationReferenceCapture } from '@frigg/shared';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const SAFE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AutomationReferenceStoreErrorCode = 'capture_not_found' | 'invalid_capture' | 'persistence_failed' | 'corrupt_store';

export class AutomationReferenceStoreError extends Error {
  constructor(readonly code: AutomationReferenceStoreErrorCode, message: string) {
    super(message);
    this.name = 'AutomationReferenceStoreError';
  }
}

interface StoredIndex {
  schemaVersion: 1;
  captures: AutomationReferenceCapture[];
}

interface AddCaptureInput {
  automationId: string;
  nodeId: string;
  serial: string;
  png: Buffer;
  width: number;
  height: number;
  rotation: 0 | 1 | 2 | 3;
}

export interface AutomationReferenceStoreOptions {
  maxCapturesPerNode?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validCapture(value: unknown): value is AutomationReferenceCapture {
  if (!isRecord(value)) return false;
  return SAFE_ID.test(String(value.id)) && typeof value.automationId === 'string' && value.automationId.length > 0 &&
    typeof value.nodeId === 'string' && value.nodeId.length > 0 && value.nodeId.length <= 128 &&
    typeof value.serial === 'string' && value.serial.length > 0 && value.serial.length <= 256 &&
    value.mimeType === 'image/png' && Number.isInteger(value.size) && Number(value.size) > 0 && Number(value.size) <= MAX_IMAGE_BYTES &&
    Number.isInteger(value.width) && Number(value.width) > 0 && Number(value.width) <= 16_384 &&
    Number.isInteger(value.height) && Number(value.height) > 0 && Number(value.height) <= 16_384 &&
    Number.isInteger(value.rotation) && Number(value.rotation) >= 0 && Number(value.rotation) <= 3 &&
    typeof value.createdAt === 'number' && Number.isFinite(value.createdAt);
}

function missing(error: unknown): boolean {
  return isRecord(error) && error.code === 'ENOENT';
}

export class AutomationReferenceStore {
  private entries = new Map<string, AutomationReferenceCapture>();
  private mutationTail: Promise<void> = Promise.resolve();

  private constructor(private readonly directory: string, private readonly options: AutomationReferenceStoreOptions) {}

  static async load(directory: string, options: AutomationReferenceStoreOptions = {}): Promise<AutomationReferenceStore> {
    const store = new AutomationReferenceStore(directory, options);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    let contents: string;
    try {
      contents = await readFile(join(directory, 'index.json'), 'utf8');
    } catch (error) {
      if (missing(error)) return store;
      throw error;
    }
    try {
      const parsed: unknown = JSON.parse(contents);
      if (!isRecord(parsed) || parsed.schemaVersion !== 1 || !Array.isArray(parsed.captures) || !parsed.captures.every(validCapture)) {
        throw new Error('Unexpected reference capture storage format.');
      }
      for (const capture of parsed.captures) {
        if (store.entries.has(capture.id)) throw new Error('Duplicate capture ID.');
        store.entries.set(capture.id, capture);
      }
      return store;
    } catch (error) {
      throw new AutomationReferenceStoreError('corrupt_store', `Could not read automation references: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  list(automationId: string, nodeId?: string): AutomationReferenceCapture[] {
    return [...this.entries.values()]
      .filter((capture) => capture.automationId === automationId && (nodeId === undefined || capture.nodeId === nodeId))
      .sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id))
      .map((capture) => structuredClone(capture));
  }

  async add(input: AddCaptureInput): Promise<AutomationReferenceCapture> {
    return this.mutate(async () => {
      if (!input || typeof input.automationId !== 'string' || input.automationId.length === 0 ||
        typeof input.nodeId !== 'string' || input.nodeId.length === 0 || input.nodeId.length > 128 ||
        typeof input.serial !== 'string' || input.serial.trim() === '' || input.serial.length > 256 ||
        !Buffer.isBuffer(input.png) || input.png.length < PNG_SIGNATURE.length || input.png.length > MAX_IMAGE_BYTES ||
        !input.png.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE) ||
        !Number.isInteger(input.width) || input.width < 1 || input.width > 16_384 ||
        !Number.isInteger(input.height) || input.height < 1 || input.height > 16_384 ||
        !Number.isInteger(input.rotation) || input.rotation < 0 || input.rotation > 3) {
        throw new AutomationReferenceStoreError('invalid_capture', 'Reference capture metadata or PNG is invalid.');
      }
      const capture: AutomationReferenceCapture = {
        id: randomUUID(), automationId: input.automationId, nodeId: input.nodeId, serial: input.serial,
        mimeType: 'image/png', size: input.png.length, width: input.width, height: input.height,
        rotation: input.rotation, createdAt: Date.now(),
      };
      const imagePath = this.imagePath(capture.id);
      const next = new Map(this.entries);
      next.set(capture.id, capture);
      const limit = Math.max(1, Math.floor(this.options.maxCapturesPerNode ?? 20));
      const history = [...next.values()]
        .filter((entry) => entry.automationId === capture.automationId && entry.nodeId === capture.nodeId)
        .sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id));
      const expired = history.slice(limit);
      for (const entry of expired) next.delete(entry.id);
      await writeFile(imagePath, input.png, { mode: 0o600, flag: 'wx' });
      try {
        await this.persist(next);
      } catch (error) {
        await rm(imagePath, { force: true });
        throw error;
      }
      this.entries = next;
      await Promise.all(expired.map((entry) => rm(this.imagePath(entry.id), { force: true })));
      return structuredClone(capture);
    });
  }

  async readImage(id: string): Promise<Buffer> {
    if (!SAFE_ID.test(id)) throw new AutomationReferenceStoreError('capture_not_found', 'Reference capture not found.');
    if (!this.entries.has(id)) throw new AutomationReferenceStoreError('capture_not_found', 'Reference capture not found.');
    try {
      return await readFile(this.imagePath(id));
    } catch (error) {
      if (missing(error)) throw new AutomationReferenceStoreError('capture_not_found', 'Reference capture image not found.');
      throw error;
    }
  }

  async retainNodes(automationId: string, nodeIds: Set<string>): Promise<void> {
    await this.mutate(async () => {
      const removed = [...this.entries.values()].filter((entry) => entry.automationId === automationId && !nodeIds.has(entry.nodeId));
      await this.remove(removed);
    });
  }

  async deleteForAutomation(automationId: string): Promise<void> {
    await this.mutate(async () => {
      const removed = [...this.entries.values()].filter((entry) => entry.automationId === automationId);
      await this.remove(removed);
    });
  }

  private async remove(removed: AutomationReferenceCapture[]): Promise<void> {
    if (removed.length === 0) return;
    const next = new Map(this.entries);
    for (const entry of removed) next.delete(entry.id);
    await this.persist(next);
    this.entries = next;
    await Promise.all(removed.map((entry) => rm(this.imagePath(entry.id), { force: true })));
  }

  private imagePath(id: string): string {
    return join(this.directory, `${id}.png`);
  }

  private mutate<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutationTail.then(operation);
    this.mutationTail = result.then(() => undefined, () => undefined);
    return result;
  }

  private async persist(entries: Map<string, AutomationReferenceCapture>): Promise<void> {
    const indexPath = join(this.directory, 'index.json');
    const temporaryPath = `${indexPath}.${randomUUID()}.tmp`;
    const payload: StoredIndex = { schemaVersion: 1, captures: [...entries.values()] };
    try {
      await mkdir(dirname(indexPath), { recursive: true, mode: 0o700 });
      await writeFile(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      await rename(temporaryPath, indexPath);
    } catch (error) {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
      throw new AutomationReferenceStoreError('persistence_failed', error instanceof Error ? error.message : String(error));
    }
  }
}
