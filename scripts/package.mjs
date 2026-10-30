import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const mode = process.argv[2];
if (!['release', 'local', 'portable'].includes(mode)) throw new Error('Choose release, local or portable packaging.');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = { ...process.env, URL_FLOW_PACKAGE_MODE: mode };
function run(script, args = []) {
  const result = spawnSync(process.execPath, [path.join(root, script), ...args], { cwd: root, env, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run('scripts/build-electron.mjs');
// Validate the release inputs before building an installer. No environment values are logged.
process.env.URL_FLOW_PACKAGE_MODE = mode;
createRequire(import.meta.url)('../electron-builder.config.cjs');
run('node_modules/vite/bin/vite.js', ['build']);
run('node_modules/electron-builder/cli.js', [
  '--win', mode === 'portable' ? 'portable' : 'nsis', '--config', 'electron-builder.config.cjs', '--publish', 'never',
]);
