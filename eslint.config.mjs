import js from "@eslint/js";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";
import prettier from "eslint-config-prettier";
import globals from "globals";

// Flat config that replaces biome.json. Non-type-checked (no parserOptions.project)
// to match Biome's speed and avoid wiring the pnpm workspace's tsconfigs. Rule
// levels mirror the tuned set that lived in biome.json's `linter.rules`.
export default tseslint.config(
  // Ignore list mirrors biome.json `files.includes` negations.
  {
    ignores: [
      "**/node_modules/**",
      "**/build/**",
      "**/dist/**",
      "**/_generated/**",
      "**/route-types.gen.ts",
      "pnpm-lock.yaml",
      "**/.tmp-*",
      "examples/*/src/client/**",
      "examples/cms/app/styles.css",
    ],
  },

  // Base JS + TS recommended (non-type-checked).
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // React ecosystem, scoped to the files that contain JSX/hooks.
  {
    files: ["**/*.{ts,tsx,js,jsx,mjs}"],
    plugins: {
      react,
      "react-hooks": reactHooks,
      "jsx-a11y": jsxA11y,
    },
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    settings: {
      react: { version: "detect" },
    },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.configs.recommended.rules,

      // The new JSX transform (React 19) — no React import needed in scope.
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",

      // ── Mapped from biome.json ──────────────────────────────────────────
      "@typescript-eslint/no-explicit-any": "off", // biome noExplicitAny: off
      "no-console": "off", // biome noConsole: off
      "@typescript-eslint/no-empty-object-type": "off", // biome noEmptyInterface: off
      "@typescript-eslint/no-non-null-assertion": "off", // biome noNonNullAssertion: off
      "no-cond-assign": "warn", // ~biome noAssignInExpressions
      "react/no-array-index-key": "warn", // biome noArrayIndexKey
      "array-callback-return": "warn", // biome useIterableCallbackReturn
      "react/no-danger": "warn", // biome noDangerouslySetInnerHtml
      "react-hooks/exhaustive-deps": "warn", // biome useExhaustiveDependencies
      "react/no-children-prop": "warn", // biome noChildrenProp

      // Biome surfaced unused vars as non-blocking warnings, not errors; match
      // that, and honor the repo's `_`-prefix + rest-sibling "intentionally
      // unused" conventions (e.g. `_env`/`_ctx`, `const { passwordHash, ...u }`).
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
      // Allow irregular whitespace inside template literals — the directive
      // tests embed a real UTF-8 BOM to assert the parser tolerates it. Still
      // flagged in code/identifiers. Biome did not enforce this at all.
      "no-irregular-whitespace": ["error", { skipTemplates: true }],
      // No Biome equivalent; escaping apostrophes in prose copy is pure noise.
      "react/no-unescaped-entities": "off",
    },
  },

  // CommonJS config files (pm2, etc.) — give them Node globals + module scope so
  // `module`/`require` aren't flagged as undefined.
  {
    files: ["**/*.cjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: { ...globals.node },
    },
  },

  // jsx-a11y had "info" in Biome; ESLint has no info level, so downgrade a11y to
  // advisory warnings rather than the plugin's default errors. Only the rules the
  // recommended config actually ENABLES are touched — rules it ships as "off"
  // (e.g. the deprecated label-has-for, control-has-associated-label) stay off —
  // and each rule keeps its recommended options.
  {
    files: ["**/*.{ts,tsx,js,jsx,mjs}"],
    rules: Object.fromEntries(
      Object.entries(jsxA11y.configs.recommended.rules)
        .filter(([, sev]) => {
          const level = Array.isArray(sev) ? sev[0] : sev;
          return level !== "off" && level !== 0;
        })
        .map(([rule, sev]) => [rule, Array.isArray(sev) ? ["warn", ...sev.slice(1)] : "warn"]),
    ),
  },

  // Must come last: turns off every stylistic rule that would fight Prettier.
  prettier,
);
