import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base relativa: el sitio funciona igual en localhost que en /<repo>/ de GitHub Pages
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: { outDir: "dist", chunkSizeWarningLimit: 900 },
  server: { port: 12001, host: true },
});
