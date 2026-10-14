// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Build statico per GitHub Pages: GITHUB_PAGES=1 bun run build → base /polimapp/ e shell SPA prerenderizzata.
const pages = process.env["GITHUB_PAGES"] === "1";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
    ...(pages ? { spa: { enabled: true, prerender: { outputPath: "/index.html" } }, router: { basepath: "/polimapp/" } } : {}),
  },
  vite: {
    ...(pages ? { base: "/polimapp/" } : {}),
    // una sola copia di MapLibre condivisa con il plugin Leaflet (serve per setWorkerUrl)
    optimizeDeps: { include: ["maplibre-gl", "@maplibre/maplibre-gl-leaflet"] },
  },
});
