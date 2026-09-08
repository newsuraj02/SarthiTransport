import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";

// Stamped once per `npm run build` invocation and baked into the JS bundle
// via `define` below — see src/App.jsx's APP_VERSION / force-update gate.
// A tiny writeBundle plugin then emits the exact same value as dist/version.json
// so the two are guaranteed to agree (both come from this one variable,
// computed once, in the same build).
const buildVersion = String(Date.now());

export default defineConfig({
  plugins: [
    react(),
    {
      name: "emit-version-json",
      writeBundle(options) {
        fs.writeFileSync(path.join(options.dir, "version.json"), JSON.stringify({ version: buildVersion }));
      },
    },
  ],
  define: {
    __APP_VERSION__: JSON.stringify(buildVersion),
  },
  server: {
    host: true,
  },
});
