import { openAsBlob } from 'node:fs';
import { stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  APK_STORE_MAX_FILE_BYTES,
  type ApkStoreEntry,
  type ApkStoreSnapshot,
} from '@frigg/shared';
import { del, get, post, postBlob } from './frigg-api.ts';

function ok(value: unknown): { content: [{ type: 'text'; text: string }] } {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

function err(error: unknown): { content: [{ type: 'text'; text: string }]; isError: true } {
  return { content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }], isError: true };
}

export function registerApkStoreTools(server: McpServer): void {
  server.tool(
    'frigg_apk_store_list',
    'List APKs saved in Frigg, with their descriptions, original/stored sizes, compression, and opaque IDs.',
    async () => {
      try {
        return ok(await get<ApkStoreSnapshot>('/api/apk-store'));
      } catch (error) {
        return err(error);
      }
    },
  );

  server.tool(
    'frigg_apk_store_import',
    'Import one user-provided local .apk file into Frigg. Ask for the exact file path; do not scan directories for APKs.',
    {
      filePath: z.string().trim().min(1).describe('Path to the .apk file explicitly provided by the user'),
      name: z.string().trim().min(1).max(120).optional().describe('Display name (defaults to the file name)'),
      description: z.string().max(2_000).optional().describe('Short context describing what this APK is for'),
    },
    async ({ filePath, name, description }) => {
      try {
        const localPath = filePath.startsWith('~/')
          ? path.join(os.homedir(), filePath.slice(2))
          : filePath;
        if (path.extname(localPath).toLowerCase() !== '.apk') {
          return err(new Error('Choose a file whose name ends in .apk.'));
        }
        const fileStat = await stat(localPath);
        if (!fileStat.isFile()) return err(new Error('The supplied path is not a regular file.'));
        if (fileStat.size <= 0) return err(new Error('The selected APK file is empty.'));
        if (fileStat.size > APK_STORE_MAX_FILE_BYTES) return err(new Error('APK files must be 1 GiB or smaller.'));

        const query = new URLSearchParams({ fileName: path.basename(localPath) });
        if (name !== undefined) query.set('name', name);
        if (description !== undefined) query.set('description', description);
        const blob = await openAsBlob(localPath, { type: 'application/octet-stream' });
        const entry = await postBlob<ApkStoreEntry>(`/api/apk-store?${query}`, blob);
        return ok(entry);
      } catch (error) {
        return err(error);
      }
    },
  );

  server.tool(
    'frigg_apk_store_install',
    'Install one saved APK on exactly one authorized, online Android device. This can update the app already on that device.',
    {
      apkId: z.string().uuid().describe('Opaque APK ID returned by frigg_apk_store_list or import'),
      serial: z.string().trim().min(1).describe('Serial of the one connected Android device to install on'),
    },
    async ({ apkId, serial }) => {
      try {
        return ok(await post('/api/apk-store/' + encodeURIComponent(apkId) + '/install', { serial }));
      } catch (error) {
        return err(error);
      }
    },
  );

  server.tool(
    'frigg_apk_store_delete',
    'Delete one APK stored in Frigg. Confirm this exact deletion with the user before calling the tool.',
    {
      apkId: z.string().uuid().describe('Opaque APK ID returned by frigg_apk_store_list'),
      confirmedByUser: z.literal(true).describe('Set true only after the user explicitly confirmed deleting this APK'),
    },
    async ({ apkId }) => {
      try {
        return ok(await del(`/api/apk-store/${encodeURIComponent(apkId)}`));
      } catch (error) {
        return err(error);
      }
    },
  );
}
