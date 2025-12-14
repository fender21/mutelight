import { spawn } from 'child_process';
import electron from 'electron';

console.log('Starting MuteLight in development mode...\n');

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

  // Start Electron after initial build
  setTimeout(() => {
    console.log('[Electron] Starting Electron app...\n');
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
  }, 3000);
}, 2000);

process.on('SIGINT', () => {
  console.log('\n[Dev] Shutting down...');
  rendererProcess.kill();
  process.exit(0);
});
