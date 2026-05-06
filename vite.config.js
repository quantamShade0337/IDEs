import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('@xterm')) return 'vendor-xterm';
          if (id.includes('@monaco-editor') || id.includes('monaco-editor')) return 'vendor-monaco';
          if (id.includes('framer-motion')) return 'vendor-motion';
          if (id.includes('firebase')) return 'vendor-firebase';
          if (id.includes('react-dom') || id.includes('react-router') || (id.includes('node_modules/react/') && !id.includes('react-dom'))) return 'vendor-react';
        },
      },
    },
  },
  optimizeDeps: {
    include: ['@xterm/xterm', '@xterm/addon-fit', '@xterm/addon-web-links'],
  },
});
