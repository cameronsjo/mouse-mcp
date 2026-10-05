import { configDefaults, defineConfig } from "vitest/config";

/**
 * Vitest configuration.
 *
 * Coverage is opt-in (runs only with `--coverage`, e.g. `npm run test:cover`).
 * Thresholds are floors set slightly below current coverage to catch regression
 * without tripping on minor churn — ratchet them up as gaps close.
 */
export default defineConfig({
  test: {
    // `npm run build` emits compiled *.test.js into dist/; vitest 5 no longer skips it by default.
    exclude: [...configDefaults.exclude, "dist/**"],
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
      // Re-baselined for vitest 5, whose v8 provider counts statements and branches
      // differently (same files and tests: branches 85.4% -> 49.9% on 984 -> 1549 total).
      thresholds: {
        statements: 58,
        branches: 48,
        functions: 63,
        lines: 58,
      },
    },
  },
});
