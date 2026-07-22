import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => {
    return {
      plugins: [react(), tailwindcss()],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        chunkSizeWarningLimit: 1600,
        rollupOptions: {
          output: {
            manualChunks(id) {
              // NOTE: match the Firebase *web* SDK only. The bare `node_modules/firebase`
              // prefix also matches `firebase-admin`, which would drag the Node-only
              // admin SDK (google-gax / grpc / google-logging-utils, which reads
              // `process` at module load) into this eagerly-loaded chunk and crash the
              // browser with "process is not defined" before React mounts. The trailing
              // slash keeps `firebase-admin` out — it stays in its lazy dynamic-import chunk.
              if (id.includes('node_modules/firebase/') || id.includes('node_modules/@firebase/')) {
                return 'firebase';
              }
              if (id.includes('node_modules/recharts') || id.includes('node_modules/lucide-react')) {
                return 'ui-vendor';
              }
              if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/react-router-dom')) {
                return 'react-vendor';
              }
            }
          }
        }
      }
    };
});
