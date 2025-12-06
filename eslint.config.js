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

      // Require explicit member accessibility
      "@typescript-eslint/explicit-member-accessibility": [
        "error",
        { accessibility: "explicit", overrides: { constructors: "no-public" } },
      ],

      // Naming conventions
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
          // Allow HTTP headers like Cookie, Accept, Accept-Language
          selector: "objectLiteralProperty",
          format: null,
          filter: {
            regex: "^(Cookie|Accept|Accept-Language|Content-Type|Authorization|User-Agent)$",
            match: true,
          },
        },
      ],

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

      // Require consistent type assertions
      "@typescript-eslint/consistent-type-assertions": [
        "error",
        {
          assertionStyle: "as",
          objectLiteralTypeAssertions: "never",
        },
      ],

      // Relax restriction on template expressions (useful for logging)
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        {
          allowNumber: true,
          allowBoolean: true,
          allowNullish: false,
          allowRegExp: false,
        },
      ],
    },
  },
  {
    ignores: ["dist/**", "node_modules/**", "*.js", "*.mjs", "*.cjs"],
  }
);
