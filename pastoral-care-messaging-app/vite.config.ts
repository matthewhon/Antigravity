import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(), 
    tailwindcss(),
  ],
  base: '/',
  build: {
    modulePreload: false,
    target: 'es2015',
    // Use terser (already a dev-dep) to strip console.log and debugger statements
    // from the production bundle, preventing user IDs from leaking via logcat.
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },
  },
})
