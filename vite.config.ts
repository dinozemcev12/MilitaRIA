import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  base: './',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    sourcemap: true,
    minify: 'esbuild',
    target: 'es2022'
  },
  server: {
    port: 3000,
    open: true,
    watch: {
      ignored: ['**/release/**', '**/release/**/*']
    }
  },
  resolve: {
    alias: {
      '@core': '/src/core',
      '@world': '/src/world',
      '@country': '/src/country',
      '@politics': '/src/politics',
      '@economy': '/src/economy',
      '@diplomacy': '/src/diplomacy',
      '@military': '/src/military',
      '@tactical': '/src/tactical',
      '@events': '/src/events',
      '@ai': '/src/ai',
      '@ui': '/src/ui',
      '@save': '/src/save',
      '@data': '/src/data'
    }
  }
});