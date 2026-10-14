import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";
import { readFile, writeFile } from "node:fs/promises";

export default defineConfig({
  plugins: [{
    name: "sunoto-preview-notice",
    transformIndexHtml(html, context) {
      if (process.env.SUNOTO_PUBLIC_PREVIEW !== "1" || context.path !== "/index.html") return html;
      return html.replace("<body>", '<body><aside role="status" style="padding:14px 20px;background:#183429;color:#fff;text-align:center;font:16px/1.5 system-ui">SunoTo preview — Chat, accounts, payments and radio are preparing to open. Please check back soon.</aside>');
    },
    async closeBundle() {
      if (process.env.SUNOTO_PUBLIC_PREVIEW !== "1") return;
      const headersPath = new URL("./dist/_headers", import.meta.url);
      const headers = await readFile(headersPath, "utf8");
      await writeFile(headersPath, headers.replace(/connect-src [^;]+/, "connect-src 'self' wss://sunoto.grasany.com"));
    }
  }],
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
