import tseslint from "typescript-eslint";

/**
 * Få regler med flit. Testerna och typkontrollen sköter resten, och en linter som
 * klagar på allt slutar någon läsa.
 *
 * `no-floating-promises` är skälet att den finns. En glömd `await` på en vakt som
 * `assertWritable` ser ut att fungera, medan åtgärden fortsätter och skriver.
 */
export default tseslint.config(
  { ignores: [".next/**", "node_modules/**", "public/**", "next-env.d.ts"] },
  {
    files: ["src/**/*.{ts,tsx}"],
    linterOptions: { reportUnusedDisableDirectives: "off" },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { projectService: true },
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
      // Kommentarer i koden nämner Nexts regel. Den körs inte, men måste finnas.
      "@next/next": { rules: { "no-img-element": { create: () => ({}) } } },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
    },
  }
);
