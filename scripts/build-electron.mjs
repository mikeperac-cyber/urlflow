import { build } from 'esbuild';
import { writeFile } from 'node:fs/promises';

const packageMode = process.env.URL_FLOW_PACKAGE_MODE || 'development';
if (!['development', 'release', 'local', 'portable'].includes(packageMode)) throw new Error('Invalid package mode.');

await build({
  entryPoints: ['electron/main.ts', 'electron/preload.ts', 'electron/updateConfig.ts'],
  outdir: 'dist-electron',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron', 'electron-updater'],
  define: { __URL_FLOW_PACKAGE_MODE__: JSON.stringify(packageMode) },
  sourcemap: false,
  logLevel: 'info',
  outExtension: { '.js': '.cjs' },
});
await writeFile('dist-electron/package-mode.json', JSON.stringify({ mode: packageMode }));
