import { defineConfig } from "vite";

export default defineConfig({
  root: "web",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: "web/index.html",
        admin: "web/admin.html",
        grievance: "web/grievance.html",
        privacy: "web/privacy.html",
        terms: "web/terms.html",
        guidelines: "web/community-guidelines.html"
      }
    }
  }
});
