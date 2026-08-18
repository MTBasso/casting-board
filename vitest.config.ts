import { defineConfig } from "vitest/config";

// Kept separate from vite.config.ts on purpose: vitest ships its own copy of
// vite, and importing both sets of plugin types into one file collides under
// exactOptionalPropertyTypes. The sim tests are pure node and need no plugins.
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
