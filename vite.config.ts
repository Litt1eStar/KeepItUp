import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // relative paths so dist/ works when opened from any folder / offline
  build: {
    chunkSizeWarningLimit: 2000, // Phaser is ~1.2 MB; that's fine for a booth build
  },
  server: { port: 5173 },
});
