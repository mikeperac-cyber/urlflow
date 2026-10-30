import { spawn } from 'node:child_process';
import { context } from 'esbuild';
import { createServer } from 'vite';
import electronPath from 'electron';

let electronProcess = null;
let restarting = false;
let shuttingDown = false;
let initialBuildDone = false;

const server = await createServer({ server: { port: 5173, strictPort: true } });
await server.listen();
const devUrl = 'http://localhost:5173';
console.log(`[dev] renderer ready at ${devUrl}`);

function startElectron() {
  if (shuttingDown) return;
  electronProcess = spawn(electronPath, ['.'], {
    env: { ...process.env, VITE_DEV_SERVER_URL: devUrl, ELECTRON_ENABLE_LOGGING: '1' },
    stdio: 'inherit',
  });
  electronProcess.on('exit', (code) => {
    electronProcess = null;
    if (!shuttingDown && !restarting) shutdown(code ?? 0);
  });
}

function restartElectron() {
  if (shuttingDown) return;
  if (electronProcess) {
    restarting = true;
    electronProcess.once('exit', () => {
      restarting = false;
      startElectron();
    });
    electronProcess.kill();
  } else {
    startElectron();
  }
}

const ctx = await context({
  entryPoints: ['electron/main.ts', 'electron/preload.ts'],
  outdir: 'dist-electron',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron', 'electron-updater'],
  sourcemap: 'inline',
  logLevel: 'info',
  outExtension: { '.js': '.cjs' },
  plugins: [
    {
      name: 'launch-electron',
      setup(build) {
        build.onEnd((result) => {
          if (result.errors.length > 0) return;
          if (!initialBuildDone) {
            initialBuildDone = true;
            startElectron();
          } else {
            console.log('[dev] main process changed, restarting Electron');
            restartElectron();
          }
        });
      },
    },
  ],
});

await ctx.watch();

async function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    await ctx.dispose();
    await server.close();
  } catch {
    /* ignore */
  }
  process.exit(code);
}

process.on('SIGINT', () => {
  shuttingDown = true;
  if (electronProcess) electronProcess.kill();
  shutdown(0);
});
process.on('SIGTERM', () => shutdown(0));
