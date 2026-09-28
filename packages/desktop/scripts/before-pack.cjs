const { execFileSync, execSync } = require('node:child_process');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..', '..');

module.exports = async function beforePack() {
  console.log('[frigg] rebuilding the web UI before packaging…');
  execSync('npm run build --workspace @frigg/web', { stdio: 'inherit', cwd: repoRoot });

  const electronPackageJson = require.resolve('electron/package.json');
  const electronVersion = require(electronPackageJson).version;
  console.log(`[frigg] rebuilding better-sqlite3 for electron ${electronVersion}…`);
  execFileSync('npx', [
    'electron-rebuild',
    '--version', electronVersion,
    '--arch', process.arch,
    '--module-dir', repoRoot,
    '--which-module', 'better-sqlite3',
    '--force',
  ], {
    stdio: 'inherit',
    cwd: repoRoot,
  });
};
