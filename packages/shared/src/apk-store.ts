export const APK_STORE_COMPRESSION = {
  raw: 'raw',
  gzip: 'gzip',
} as const;

export type ApkStoreCompression = (typeof APK_STORE_COMPRESSION)[keyof typeof APK_STORE_COMPRESSION];

export const APK_STORE_MAX_FILE_BYTES = 1_073_741_824;
export const APK_STORE_INSTALL_TIMEOUT_MS = 300_000;

export interface ApkStoreEntry {
  id: string;
  name: string;
  description: string;
  fileName: string;
  originalSizeBytes: number;
  storedSizeBytes: number;
  compression: ApkStoreCompression;
  sha256: string;
  createdAt: number;
}

export interface ApkStoreSnapshot {
  entries: ApkStoreEntry[];
}
