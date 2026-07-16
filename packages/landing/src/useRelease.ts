export const REPO = 'frigg-tools/frigg-desktop';
export const RELEASES_URL = `https://github.com/${REPO}/releases/latest`;
export const REPO_URL = `https://github.com/${REPO}`;
export const DOWNLOAD_BASE = 'https://frigg.guicardoso.dev/downloads';

export type Arch = 'apple' | 'intel';

export interface DmgAsset {
  arch: Arch;
  url: string;
  size: number;
}

export interface Release {
  version: string;
  assets: DmgAsset[];
}

export type ReleaseState =
  | { status: 'loading' }
  | { status: 'ready'; release: Release }
  | { status: 'error' };

const RELEASE: Release = {
  version: 'v1.1.0',
  assets: [{ arch: 'apple', url: `${DOWNLOAD_BASE}/Frigg-1.1.0-arm64.dmg`, size: 105725442 }],
};

export function detectArch(): Arch {
  return 'apple';
}

export function formatSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1000 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
}

export function useRelease(): ReleaseState {
  return { status: 'ready', release: RELEASE };
}
