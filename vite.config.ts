import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath, URL } from "node:url";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  // itch.io and GitHub Pages both serve from a subpath; relative base works on both.
  base: "./",
  resolve: {
    alias: {
      "@sim": r("./src/sim"),
      "@engine": r("./src/engine"),
      "@ui": r("./src/ui"),
      "@data": r("./src/data"),
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      // Creature sprites live in public/ and are part of the game, not decoration
      // — without this the PWA loads offline showing 151 broken images.
      workbox: {
        // Animated sprites are ~5MB all told — far too much to precache, which
        // would make installing the app a 5MB download. They are cached on first
        // view instead, so the app installs small and still works offline once
        // you have actually seen a creature.
        globPatterns: ["**/*.{js,css,html,ico,svg,webmanifest}"],
        runtimeCaching: [
          {
            urlPattern: /\/sprites\/.*\.(?:gif|png)$/,
            handler: "CacheFirst",
            options: {
              cacheName: "creature-sprites",
              expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 90 },
            },
          },
        ],
      },
      manifest: {
        name: "The Casting Board",
        short_name: "Casting Board",
        description: "A Pokemon League Manager idle game",
        theme_color: "#0F1513",
        background_color: "#0F1513",
        display: "standalone",
        orientation: "portrait",
        icons: [],
      },
    }),
  ],
});
