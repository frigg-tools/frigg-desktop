import { build } from 'esbuild';

const shared = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['electron'],
  logLevel: 'info',
};

await build({ ...shared, entryPoints: ['src/main.ts'], outfile: 'dist/main.cjs' });
await build({ ...shared, entryPoints: ['src/preload.ts'], outfile: 'dist/preload.cjs' });
await build({
  ...shared,
  format: 'esm',
  entryPoints: ['../mcp/src/index.ts'],
  outfile: 'dist/mcp/frigg-mcp.mjs',
});
