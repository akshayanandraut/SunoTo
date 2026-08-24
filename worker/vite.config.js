import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  build: {
    emptyOutDir: true,
    outDir: fileURLToPath(new URL("../work/worker-dist", import.meta.url)),
    lib: { entry: fileURLToPath(new URL("./src/index.js", import.meta.url)), formats: ["es"], fileName: "worker" },
    rollupOptions: { external: ["cloudflare:workers"] }
  }
});
