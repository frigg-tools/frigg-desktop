import { createHash, randomUUID } from 'node:crypto';
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { createGunzip, createGzip } from 'node:zlib';
import { Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import os from 'node:os';
import path from 'node:path';
import {
  APK_STORE_COMPRESSION,
  APK_STORE_MAX_FILE_BYTES,
  type ApkStoreCompression,
  type ApkStoreEntry,
  type ApkStoreSnapshot,
} from '@frigg/shared';

interface StoredCatalog {
  schemaVersion: 1;
  entries: ApkStoreEntry[];
}

export interface ApkStoreImportInput {
  fileName: string;
  name?: string;
  description?: string;
}

export class ApkStoreError extends Error {
  constructor(message: string, readonly statusCode = 400) {
    super(message);
    this.name = 'ApkStoreError';
  }
}

function isCompression(value: unknown): value is ApkStoreCompression {
  return value === APK_STORE_COMPRESSION.raw || value === APK_STORE_COMPRESSION.gzip;
}

function isEntry(value: unknown): value is ApkStoreEntry {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === 'string' && /^[0-9a-f-]{36}$/i.test(item.id) &&
    typeof item.name === 'string' && typeof item.description === 'string' &&
    typeof item.fileName === 'string' && typeof item.originalSizeBytes === 'number' &&
    Number.isSafeInteger(item.originalSizeBytes) && item.originalSizeBytes > 0 &&
    typeof item.storedSizeBytes === 'number' && Number.isSafeInteger(item.storedSizeBytes) && item.storedSizeBytes > 0 &&
    isCompression(item.compression) && typeof item.sha256 === 'string' && /^[0-9a-f]{64}$/i.test(item.sha256) &&
    typeof item.createdAt === 'number' && Number.isSafeInteger(item.createdAt);
}

function cleanFileName(input: string): string {
  const basename = input.replace(/\\/g, '/').split('/').pop() ?? '';
  const fileName = basename.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (fileName.length === 0 || fileName.length > 255 || !fileName.toLowerCase().endsWith('.apk')) {
    throw new ApkStoreError('Choose a file with the .apk extension (up to 255 characters).');
  }
  return fileName;
}

function cleanName(input: string | undefined, fileName: string): string {
  const name = (input ?? fileName).trim();
  if (name.length === 0 || name.length > 120) {
    throw new ApkStoreError('Name must contain between 1 and 120 characters.');
  }
  return name;
}

function cleanDescription(input: string | undefined): string {
  const description = (input ?? '').trim();
  if (description.length > 2_000) throw new ApkStoreError('Description must be at most 2000 characters.');
  return description;
}

function createByteCounter(onChunk: (chunk: Buffer) => void): Transform {
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      onChunk(chunk);
      callback(null, chunk);
    },
  });
}

async function hashFile(filePath: string): Promise<{ sizeBytes: number; sha256: string }> {
  const sha = createHash('sha256');
  let sizeBytes = 0;
  for await (const chunk of createReadStream(filePath)) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    sizeBytes += bytes.length;
    sha.update(bytes);
  }
  return { sizeBytes, sha256: sha.digest('hex') };
}

export class ApkStore {
  private readonly activeMaterializations = new Map<string, number>();

  private constructor(
    private readonly catalogPath: string,
    private readonly blobDirectory: string,
    private entries: ApkStoreEntry[],
  ) {}

  static async load(catalogPath: string, blobDirectory: string): Promise<ApkStore> {
    await mkdir(path.dirname(catalogPath), { recursive: true, mode: 0o700 });
    await mkdir(blobDirectory, { recursive: true, mode: 0o700 });
    await chmod(blobDirectory, 0o700);

    let entries: ApkStoreEntry[] = [];
    try {
      const parsed: unknown = JSON.parse(await readFile(catalogPath, 'utf8'));
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('Catalog must be an object.');
      }
      const catalog = parsed as Record<string, unknown>;
      if (catalog.schemaVersion !== 1 || !Array.isArray(catalog.entries) || !catalog.entries.every(isEntry)) {
        throw new Error('Catalog has an unsupported or invalid structure.');
      }
      entries = catalog.entries;
      await chmod(catalogPath, 0o600);
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
        return new ApkStore(catalogPath, blobDirectory, entries);
      }
      throw new ApkStoreError(
        `Unable to read the APK Store catalog: ${error instanceof Error ? error.message : String(error)}`,
        500,
      );
    }
    return new ApkStore(catalogPath, blobDirectory, entries);
  }

  private mutationTail: Promise<void> = Promise.resolve();

  private mutate<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutationTail.then(operation);
    this.mutationTail = result.then(() => undefined, () => undefined);
    return result;
  }

  list(): ApkStoreSnapshot {
    return {
      entries: [...this.entries]
        .sort((left, right) => right.createdAt - left.createdAt)
        .map((entry) => ({ ...entry })),
    };
  }

  get(id: string): ApkStoreEntry {
    const entry = this.entries.find((candidate) => candidate.id === id);
    if (!entry) throw new ApkStoreError('APK Store entry not found.', 404);
    return { ...entry };
  }

  async import(stream: Readable, input: ApkStoreImportInput): Promise<ApkStoreEntry> {
    const fileName = cleanFileName(input.fileName);
    const name = cleanName(input.name, fileName);
    const description = cleanDescription(input.description);
    const id = randomUUID();
    const rawTempPath = path.join(this.blobDirectory, `.${id}.raw.tmp`);
    const gzipTempPath = path.join(this.blobDirectory, `.${id}.gzip.tmp`);
    let finalBlobPath: string | undefined;

    try {
      let originalSizeBytes = 0;
      let prefix = Buffer.alloc(0);
      const sha = createHash('sha256');
      const validator = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          originalSizeBytes += chunk.length;
          if (originalSizeBytes > APK_STORE_MAX_FILE_BYTES) {
            callback(new ApkStoreError('APK files must be 1 GiB or smaller.', 413));
            return;
          }
          sha.update(chunk);
          if (prefix.length < 4) prefix = Buffer.concat([prefix, chunk.subarray(0, 4 - prefix.length)]);
          callback(null, chunk);
        },
        flush(callback) {
          if (originalSizeBytes === 0) {
            callback(new ApkStoreError('The selected APK file is empty.'));
            return;
          }
          const zipHeader = prefix[0] === 0x50 && prefix[1] === 0x4b && (
            (prefix[2] === 0x03 && prefix[3] === 0x04) ||
            (prefix[2] === 0x05 && prefix[3] === 0x06) ||
            (prefix[2] === 0x07 && prefix[3] === 0x08)
          );
          if (!zipHeader) {
            callback(new ApkStoreError('The selected file does not have an APK/ZIP signature.'));
            return;
          }
          callback();
        },
      });
      await pipeline(stream, validator, createWriteStream(rawTempPath, { flags: 'wx', mode: 0o600 }));
      const sha256 = sha.digest('hex');

      let gzipSizeBytes = 0;
      let gzipAvailable = true;
      try {
        await pipeline(
          createReadStream(rawTempPath),
          createGzip({ level: 6 }),
          createByteCounter((chunk) => { gzipSizeBytes += chunk.length; }),
          createWriteStream(gzipTempPath, { flags: 'wx', mode: 0o600 }),
        );
      } catch (error) {
        const isOutOfSpace = typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOSPC';
        if (!isOutOfSpace) throw error;
        await rm(gzipTempPath, { force: true });
        const rawIntegrity = await hashFile(rawTempPath);
        if (rawIntegrity.sizeBytes !== originalSizeBytes || rawIntegrity.sha256 !== sha256) {
          throw new Error('The raw APK changed while preparing its compressed representation.');
        }
        gzipAvailable = false;
      }

      const compression = gzipAvailable && gzipSizeBytes < originalSizeBytes
        ? APK_STORE_COMPRESSION.gzip
        : APK_STORE_COMPRESSION.raw;
      const storedSizeBytes = compression === APK_STORE_COMPRESSION.gzip ? gzipSizeBytes : originalSizeBytes;
      const selectedTempPath = compression === APK_STORE_COMPRESSION.gzip ? gzipTempPath : rawTempPath;
      const blobName = this.blobName(id, compression);
      finalBlobPath = path.join(this.blobDirectory, blobName);
      await rename(selectedTempPath, finalBlobPath);

      const entry: ApkStoreEntry = {
        id,
        name,
        description,
        fileName,
        originalSizeBytes,
        storedSizeBytes,
        compression,
        sha256,
        createdAt: Date.now(),
      };
      await this.mutate(async () => {
        const next = [...this.entries, entry];
        await this.persist(next);
        this.entries = next;
      });
      finalBlobPath = undefined;
      return { ...entry };
    } catch (error) {
      if (error instanceof ApkStoreError) throw error;
      throw new ApkStoreError(`Unable to store the APK: ${error instanceof Error ? error.message : String(error)}`, 500);
    } finally {
      await Promise.all([
        rm(rawTempPath, { force: true }).catch(() => undefined),
        rm(gzipTempPath, { force: true }).catch(() => undefined),
        finalBlobPath ? rm(finalBlobPath, { force: true }).catch(() => undefined) : Promise.resolve(),
      ]);
    }
  }

  async delete(id: string): Promise<void> {
    await this.mutate(async () => {
      const entry = this.entries.find((candidate) => candidate.id === id);
      if (!entry) throw new ApkStoreError('APK Store entry not found.', 404);
      if ((this.activeMaterializations.get(id) ?? 0) > 0) {
        throw new ApkStoreError('This APK is being installed and cannot be deleted yet.', 409);
      }
      const blobPath = path.join(this.blobDirectory, this.blobName(entry.id, entry.compression));
      const tombstonePath = `${blobPath}.${randomUUID()}.delete`;
      try {
        await rename(blobPath, tombstonePath);
      } catch (error) {
        throw new ApkStoreError(`Unable to access the stored APK: ${error instanceof Error ? error.message : String(error)}`, 500);
      }
      const next = this.entries.filter((candidate) => candidate.id !== id);
      try {
        await this.persist(next);
        this.entries = next;
      } catch (error) {
        await rename(tombstonePath, blobPath).catch(() => undefined);
        throw error;
      }
      await rm(tombstonePath, { force: true }).catch(() => undefined);
    });
  }

  async materialize(id: string): Promise<{ path: string; cleanup: () => Promise<void> }> {
    const entry = this.get(id);
    this.activeMaterializations.set(id, (this.activeMaterializations.get(id) ?? 0) + 1);
    const blobPath = path.join(this.blobDirectory, this.blobName(entry.id, entry.compression));
    const outputPath = path.join(os.tmpdir(), `frigg-apk-${randomUUID()}.apk`);
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      const count = this.activeMaterializations.get(id) ?? 0;
      if (count <= 1) this.activeMaterializations.delete(id);
      else this.activeMaterializations.set(id, count - 1);
    };
    try {
      const blobStat = await lstat(blobPath);
      if (!blobStat.isFile()) throw new Error('Stored APK blob is not a regular file.');
      const sha = createHash('sha256');
      let outputSizeBytes = 0;
      const verifier = createByteCounter((chunk) => {
        outputSizeBytes += chunk.length;
        sha.update(chunk);
      });
      const source = createReadStream(blobPath);
      const restore = entry.compression === APK_STORE_COMPRESSION.gzip ? createGunzip() : undefined;
      if (restore) await pipeline(source, restore, verifier, createWriteStream(outputPath, { flags: 'wx', mode: 0o600 }));
      else await pipeline(source, verifier, createWriteStream(outputPath, { flags: 'wx', mode: 0o600 }));
      await chmod(outputPath, 0o600);
      if (outputSizeBytes !== entry.originalSizeBytes || sha.digest('hex') !== entry.sha256) {
        throw new Error('Stored APK failed its size or SHA-256 integrity check.');
      }
      return {
        path: outputPath,
        cleanup: async () => {
          try {
            await rm(outputPath, { force: true });
          } finally {
            release();
          }
        },
      };
    } catch (error) {
      await rm(outputPath, { force: true }).catch(() => undefined);
      release();
      const message = error instanceof Error ? error.message : String(error);
      throw new ApkStoreError(`Unable to prepare the APK for installation: ${message}`, 500);
    }
  }

  private blobName(id: string, compression: ApkStoreCompression): string {
    return compression === APK_STORE_COMPRESSION.gzip ? `${id}.apk.gz` : `${id}.apk`;
  }

  private async persist(entries: ApkStoreEntry[]): Promise<void> {
    const temporaryPath = `${this.catalogPath}.${randomUUID()}.tmp`;
    const catalog: StoredCatalog = { schemaVersion: 1, entries };
    try {
      await writeFile(temporaryPath, `${JSON.stringify(catalog, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      await chmod(temporaryPath, 0o600);
      await rename(temporaryPath, this.catalogPath);
    } catch (error) {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
      throw new ApkStoreError(`Unable to write the APK Store catalog: ${error instanceof Error ? error.message : String(error)}`, 500);
    }
  }
}
