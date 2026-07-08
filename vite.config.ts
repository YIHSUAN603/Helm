import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;
// @ts-expect-error process is a nodejs global
const tauriPlatform = process.env.TAURI_ENV_PLATFORM;
// @ts-expect-error process is a nodejs global
const tauriDebug = !!process.env.TAURI_ENV_DEBUG;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  build: {
    // Target the actual WebView engine (WebView2 on Windows, WKWebView
    // elsewhere) so no polyfills/transpilation for browsers we never run in.
    target: tauriPlatform === "windows" ? "chrome105" : "safari13",
    minify: tauriDebug ? false : ("esbuild" as const),
    sourcemap: tauriDebug,
    rollupOptions: {
      output: {
        // Keep the big, rarely-changing xterm stack out of the app chunk.
        manualChunks: {
          xterm: ["@xterm/xterm", "@xterm/addon-fit"],
        },
      },
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
