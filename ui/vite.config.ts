import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5186,
    strictPort: true,
    allowedHosts: ["democrm.pyrosa.com.do"],
    proxy: {
      "/api": {
        target: "http://127.0.0.1:10166",
        changeOrigin: true
      },
      "/__pyrosa_crm_health": {
        target: "http://127.0.0.1:10166",
        changeOrigin: true
      }
    }
  },
  preview: {
    host: "0.0.0.0",
    port: 4186
  },
  build: {
    outDir: "dist",
    emptyOutDir: true
  }
});
