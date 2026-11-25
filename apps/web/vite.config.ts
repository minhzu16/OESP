import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const proxy = {
  '/api': { target: process.env.VITE_API_PROXY ?? 'http://localhost:4000', changeOrigin: false },
};

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy },
  preview: { port: 4173, proxy },
  test: {
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'lcov'],
      reportsDirectory: './coverage',
      exclude: ['node_modules/', 'dist/', '**/*.d.ts', '**/*.config.*'],
      thresholds: {
        lines: 8,
        functions: 55,
        branches: 65,
        statements: 8,
      },
    },
  },
});
