import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 6688,
    proxy: {
      '/api': {
        target: 'http://localhost:3789',
        changeOrigin: true,
      },
    },
  },
});