const { execSync } = require('node:child_process');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..', '..');

module.exports = async function beforePack() {
  console.log('[frigg] rebuilding the web UI before packaging…');
  execSync('npm run build --workspace @frigg/web', { stdio: 'inherit', cwd: repoRoot });
};
