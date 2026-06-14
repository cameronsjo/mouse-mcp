import { defineConfig } from "vitest/config";

/**
 * Vitest configuration.
 *
 * Coverage is opt-in (runs only with `--coverage`, e.g. `npm run test:cover`).
 * Thresholds are floors set slightly below current coverage to catch regression
 * without tripping on minor churn — ratchet them up as gaps close.
 */
export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "json-summary", "lcov"],
      reportsDirectory: "coverage",
      include: ["src/**/*.ts"],
      exclude: [
        "**/*.test.ts",
        "**/__test-helpers__/**",
        "**/*.d.ts",
        // Type-only declarations carry no runtime logic.
        "**/types.ts",
        "src/types/**",
        // Barrel re-exports — zero logic.
        "**/index.ts",
        // Entry point + framework/SDK wiring (covered by E2E if at all).
        "src/instrumentation.ts",
        "src/observability/**",
        // Demo/example code that should not count toward the denominator.
        "src/events/example-usage.ts",
      ],
      thresholds: {
        statements: 60,
        branches: 80,
        functions: 65,
        lines: 60,
      },
    },
  },
});
