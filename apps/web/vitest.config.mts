import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  // Resuelve el alias @/* de tsconfig.json (Vite 8 lo trae integrado)
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'jsdom',
    // Testing Library limpia el DOM entre tests si afterEach es global
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
