import { execSync } from "node:child_process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function gitShortSha(): string {
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return "unknown";
  }
}

export default defineConfig({
  plugins: [react()],
  base: "/",
  define: {
    __BUILD_SHA__: JSON.stringify(gitShortSha()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
      "/yahoo-finance": {
        target: "https://query1.finance.yahoo.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/yahoo-finance/, ""),
        headers: { "User-Agent": "Mozilla/5.0" },
      },
    },
  },
});
