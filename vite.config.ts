import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/* `base: "./"` so the built bundle works no matter what path it's hosted at
 * (GitHub Pages /<repo>/, Netlify root, opened as file://, etc.) */
export default defineConfig({
  plugins: [react()],
  base: "./",
  server: {
    port: 5173,
    host: "0.0.0.0",
  },
  preview: {
    port: 4173,
    host: "0.0.0.0",
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
