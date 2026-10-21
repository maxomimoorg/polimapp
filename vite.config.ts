import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";

const pages = process.env["GITHUB_PAGES"] === "1";

export default defineConfig({
  base: pages ? "/polimapp/" : "/",
  plugins: [
    tanstackStart({
      server: { entry: "server" },
      ...(pages ? { spa: { enabled: true }, router: { basepath: "/polimapp/" } } : {}),
    }),
    react(),
    tailwindcss(),
    tsconfigPaths(),
  ],
  optimizeDeps: {
    include: ["maplibre-gl", "@maplibre/maplibre-gl-leaflet"],
  },
});
