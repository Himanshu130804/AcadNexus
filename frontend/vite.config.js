import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  if (mode === "production") {
    if (!env.VITE_API_URL) {
      throw new Error("VITE_API_URL is required for production builds. Set it to the HTTPS Render API URL ending in /api.");
    }
    let apiUrl;
    try { apiUrl = new URL(env.VITE_API_URL); }
    catch { throw new Error("VITE_API_URL must be an absolute HTTPS URL."); }
    if (apiUrl.protocol !== "https:" || !apiUrl.pathname.replace(/\/$/, "").endsWith("/api")) {
      throw new Error("VITE_API_URL must use HTTPS and end in /api for production.");
    }
  }

  return {
    plugins: [react()],
    build: { sourcemap: false },
  };
});
