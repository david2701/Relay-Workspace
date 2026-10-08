import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  // Default in Vite; explicit so /all?status=blocked reloads work in dev.
  // Production SPA fallback is served by apps/server (RELAY_WEB_DIST / web/dist).
  appType: "spa",
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 7421,
    strictPort: true,
  },
});
