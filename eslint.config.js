import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      // Enforce explicit return types for better documentation
      "@typescript-eslint/explicit-function-return-type": [
        "error",
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true,
          allowHigherOrderFunctions: true,
        },
      ],

      // Member accessibility - off for now (public is default, explicit adds noise)
      "@typescript-eslint/explicit-member-accessibility": "off",

      // Naming conventions - relaxed to allow common patterns
      "@typescript-eslint/naming-convention": [
        "error",
        {
          selector: "default",
          format: ["camelCase"],
          leadingUnderscore: "allow",
        },
        {
          selector: "variable",
          format: ["camelCase", "UPPER_CASE"],
          leadingUnderscore: "allow",
        },
        {
          selector: "typeLike",
          format: ["PascalCase"],
        },
        {
          selector: "enumMember",
          format: ["UPPER_CASE"],
        },
        {
          selector: "import",
          format: ["camelCase", "PascalCase"],
        },
        {
          // Allow any format for object literal properties (HTTP headers, config keys, etc.)
          selector: "objectLiteralProperty",
          format: null,
        },
      ],

      // Unnecessary condition checks - off (TypeScript narrowing can be overly aggressive)
      "@typescript-eslint/no-unnecessary-condition": "off",

      // Prevent floating promises (must be awaited or void-ed)
      "@typescript-eslint/no-floating-promises": "error",

      // Require promise rejection handling
      "@typescript-eslint/no-misused-promises": "error",

      // Disallow unused variables (except with underscore prefix)
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],

      // Allow non-null assertions with caution (sometimes necessary with external APIs)
      "@typescript-eslint/no-non-null-assertion": "warn",

      // Prefer nullish coalescing
      "@typescript-eslint/prefer-nullish-coalescing": "error",

      // Prefer optional chaining
      "@typescript-eslint/prefer-optional-chain": "error",

      // Consistent type imports
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],

      // Consistent type exports
      "@typescript-eslint/consistent-type-exports": "error",

      // No magic numbers (except common ones) - disabled for now, enable later
      "@typescript-eslint/no-magic-numbers": "off",

      // Require switch exhaustiveness checking
      "@typescript-eslint/switch-exhaustiveness-check": "error",

      // Strict boolean expressions - warn for now to allow gradual adoption
      "@typescript-eslint/strict-boolean-expressions": [
        "warn",
        {
          allowString: true,
          allowNumber: false,
          allowNullableObject: true,
          allowNullableBoolean: true,
          allowNullableString: true,
          allowNullableNumber: false,
          allowAny: false,
        },
      ],

      // Require Array<T> instead of T[] for complex types
      "@typescript-eslint/array-type": ["error", { default: "array-simple" }],

      // Relax restriction on template expressions (useful for logging)
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        {
          allowNumber: true,
          allowBoolean: true,
          allowNullish: true,
          allowRegExp: false,
        },
      ],

      // Allow async functions without await (useful for interface conformance)
      "@typescript-eslint/require-await": "off",

      // Relax unsafe any rules (external API data often comes as any, LanceDB types lack precision)
      "@typescript-eslint/no-unsafe-assignment": "warn",
      "@typescript-eslint/no-unsafe-member-access": "warn",
      "@typescript-eslint/no-unsafe-argument": "warn",
      "@typescript-eslint/no-unsafe-call": "warn",

      // Allow deprecated APIs (e.g., MCP SDK Server class during migration)
      "@typescript-eslint/no-deprecated": "warn",

      // Allow type assertions in object literals (useful for building typed objects)
      "@typescript-eslint/consistent-type-assertions": [
        "error",
        {
          assertionStyle: "as",
          objectLiteralTypeAssertions: "allow-as-parameter",
        },
      ],
    },
  },
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "*.js",
      "*.mjs",
      "*.cjs",
      // Example and migration documentation files (intentional non-standard naming)
      "**/*-example*.ts",
      "**/example-*.ts",
    ],
  }
);
