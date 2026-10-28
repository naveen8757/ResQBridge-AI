import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "pwa-icon.svg"],
      manifest: {
        name: "ResQBridge AI",
        short_name: "ResQBridge",
        description: "Offline-first disaster preparedness, coordination and recovery workspace.",
        theme_color: "#10283b",
        background_color: "#f4f7fa",
        display: "standalone",
        start_url: "/",
        icons: [{ src: "/pwa-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }],
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api\//],
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
      },
    }),
  ],
});
