import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  root: "web",
  envDir: fileURLToPath(new URL(".", import.meta.url)),
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: "web/index.html",
        admin: "web/admin.html",
        grievance: "web/grievance.html",
        feedback: "web/feedback.html",
        privacy: "web/privacy.html",
        terms: "web/terms.html",
        guidelines: "web/community-guidelines.html"
      }
    }
  }
});
