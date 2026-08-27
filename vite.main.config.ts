import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      // uiohook-napi loads a native .node binary via a path relative to its own
      // package directory (__dirname) — bundling it would break that lookup, so
      // it must stay a real runtime `require()` instead of being inlined.
      external: ['uiohook-napi'],
    },
  },
});
