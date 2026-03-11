import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  root: resolve(__dirname, "site"),
  base: process.env.SITE_BASE ?? "./",
  publicDir: resolve(__dirname, "site/public"),
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, "dist-site"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        marketing: resolve(__dirname, "site/index.html"),
        support: resolve(__dirname, "site/support/index.html"),
      },
    },
  },
});
