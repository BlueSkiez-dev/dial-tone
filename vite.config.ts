import preact from "@preact/preset-vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// Value of the `--bg` token in src/ui/styles/tokens.css. Defined once here;
// a test pins it to the token.
export const BG_TOKEN_VALUE = "#ededeb";

export default defineConfig(({ command, isPreview }) => {
  // `vite preview` runs with command "serve"; it must use the build's base,
  // or the built /dial-tone/assets/* URLs 404.
  const base = command === "build" || isPreview ? "/dial-tone/" : "/";
  return {
    base,
    plugins: [
      preact(),
      VitePWA({
        registerType: "prompt",
        manifest: {
          name: "Dial Tone",
          short_name: "Dial Tone",
          display: "standalone",
          scope: base,
          start_url: base,
          theme_color: BG_TOKEN_VALUE,
          background_color: BG_TOKEN_VALUE,
          icons: [
            // Downloaded from Figma "App icon" (270:433) into public/art/ (task 1.4).
            { src: "art/icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "art/icon-512.png", sizes: "512x512", type: "image/png" },
            {
              src: "art/icon-512-maskable.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
        workbox: {
          // Covers the app shell plus the classic decode worker, the capture
          // worklet and vendor/ggwave.js, which all build to .js files.
          globPatterns: ["**/*.{html,js,css,woff2,png,svg,webmanifest}"],
        },
      }),
    ],
    worker: { format: "iife" },
  };
});
