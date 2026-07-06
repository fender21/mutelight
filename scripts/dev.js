import { spawn } from 'child_process';
import { existsSync, statSync } from 'fs';
import electron from 'electron';

console.log('Starting MuteBeacon in development mode...\n');

const startedAt = Date.now();

// True once the watch build has written a FRESH bundle (mtime after we
// started) — launching Electron against a stale bundle causes the renderer
// and preload APIs to disagree.
function freshlyBuilt(file) {
  try {
    return existsSync(file) && statSync(file).mtimeMs >= startedAt;
  } catch {
    return false;
  }
}

// Start Vite dev server for renderer
console.log('[Renderer] Starting Vite dev server...');
const rendererProcess = spawn('vite', ['--config', 'vite.config.renderer.ts'], {
  shell: true,
  stdio: 'inherit',
});

// Wait for Vite to be ready, then build main and preload
setTimeout(() => {
  console.log('[Main] Building main process in watch mode...');
  const mainProcess = spawn(
    'vite',
    ['build', '--config', 'vite.config.main.ts', '--watch'],
    { shell: true, stdio: 'inherit' }
  );

  console.log('[Preload] Building preload script in watch mode...');
  const preloadProcess = spawn(
    'vite',
    ['build', '--config', 'vite.config.preload.ts', '--watch'],
    { shell: true, stdio: 'inherit' }
  );

  // Start Electron only after BOTH watch builds have emitted fresh bundles
  const waitForBuilds = setInterval(() => {
    if (!freshlyBuilt('dist-main/index.js') || !freshlyBuilt('dist-preload/preload.js')) {
      return;
    }
    clearInterval(waitForBuilds);

    console.log('[Electron] Fresh builds detected, starting Electron app...\n');
    const electronProcess = spawn(electron, ['.'], {
      shell: true,
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'development' },
    });

    electronProcess.on('close', () => {
      console.log('\n[Electron] App closed, shutting down dev server...');
      rendererProcess.kill();
      mainProcess.kill();
      preloadProcess.kill();
      process.exit(0);
    });
  }, 500);
}, 2000);

process.on('SIGINT', () => {
  console.log('\n[Dev] Shutting down...');
  rendererProcess.kill();
  process.exit(0);
});
