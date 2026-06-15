import { build } from 'esbuild';

await build({
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  entryPoints: ['packages/mcp/src/index.ts'],
  outfile: 'plugin/mcp/frigg-mcp.mjs',
  logLevel: 'info',
});
