const { execSync } = require('node:child_process');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..', '..');

module.exports = async function beforePack() {
  console.log('[frigg] rebuilding the web UI before packaging…');
  execSync('npm run build --workspace @frigg/web', { stdio: 'inherit', cwd: repoRoot });

  const electronVersion = require(path.join(repoRoot, 'node_modules/electron/package.json')).version;
  console.log(`[frigg] fetching better-sqlite3 prebuilt binary for electron ${electronVersion}…`);
  execSync(`npx prebuild-install -r electron -t ${electronVersion} --arch=${process.arch}`, {
    stdio: 'inherit',
    cwd: path.join(repoRoot, 'node_modules', 'better-sqlite3'),
  });
};
