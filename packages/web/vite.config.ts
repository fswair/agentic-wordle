import { SITE_URL } from "@agentic-wordle/core";
import { defineConfig } from "vite";

export default defineConfig({
  build: { outDir: "dist", target: "es2022" },
  plugins: [
    {
      // Keep the share URL in one place (core's SITE_URL) instead of hard-coding it in the HTML.
      name: "site-url",
      transformIndexHtml: (html) => html.replaceAll("__SITE_URL__", SITE_URL),
    },
  ],
});
