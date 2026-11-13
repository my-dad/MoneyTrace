import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "apps/web/out/**",
      "tooling/boundaries/fixtures/**",
      ".dependency-cruiser.cjs",
      // Deno code (CR-010): the Edge Function file and its generated bundle.
      "supabase/functions/**",
    ],
  },
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ["**/*.js", "**/*.mjs"],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ["packages/domain/**/*.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.name='parseFloat']",
          message: "No floating point for money.",
        },
        {
          selector: "CallExpression[callee.property.name='toFixed']",
          message: "No floating point for money.",
        },
      ],
    },
  },
);
