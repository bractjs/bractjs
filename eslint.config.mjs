import js from "@eslint/js";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";
import prettier from "eslint-config-prettier";
import globals from "globals";

// Non-type-checked (no parserOptions.project) for speed, and to avoid wiring the
// pnpm workspace's tsconfigs into the linter.
//
// Two pins matter here and are both deliberate (see CONTRIBUTING.md):
//   - ESLint is 9.x — eslint-plugin-react and eslint-plugin-jsx-a11y cap at
//     ESLint 9 and crash on ESLint 10's removed rule-context API.
//   - The ROOT workspace pins TypeScript 5.x — typescript-eslint needs the
//     TypeScript compiler API, which the TypeScript 7 native port does not
//     ship. packages/core and the examples still typecheck with TypeScript 7.
export default tseslint.config(
  // Keep in sync with .prettierignore.
  {
    ignores: [
      "**/node_modules/**",
      "**/build/**",
      "**/dist/**",
      "**/_generated/**",
      "**/route-types.gen.ts",
      // Emitted by `bun run typegen` (tsc --emitDeclarationOnly). Linting
      // generated output can only ever produce findings nobody can fix at the
      // source — the next typegen overwrites them.
      "packages/core/types/**",
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

      // ── Deliberately relaxed ────────────────────────────────────────────
      "@typescript-eslint/no-explicit-any": "off",
      "no-console": "off", // the framework logs deliberately
      "@typescript-eslint/no-empty-object-type": "off", // module-augmentation interfaces
      "@typescript-eslint/no-non-null-assertion": "off",
      "no-cond-assign": "warn",
      "react/no-array-index-key": "warn",
      "array-callback-return": "warn",
      "react/no-danger": "warn",
      "react-hooks/exhaustive-deps": "warn",
      "react/no-children-prop": "warn",

      // Unused vars are advisory, not blocking, and the repo's `_`-prefix +
      // rest-sibling "intentionally unused" conventions are honored
      // (e.g. `_env`/`_ctx`, `const { passwordHash, ...u }`).
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
      // flagged in code/identifiers.
      "no-irregular-whitespace": ["error", { skipTemplates: true }],
      // Escaping apostrophes in prose copy is pure noise.
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

  // a11y findings are advisory here rather than the plugin's default errors, so a
  // real framework bug is never buried under them. Only the rules the
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

  // Example apps are demonstration code, not shipped framework. A CMS
  // legitimately renders trusted stored HTML (no-danger), autofocuses its auth
  // inputs as deliberate UX (no-autofocus), and keys static demo lists by index
  // (no-array-index-key). Relax those advisory rules here so real framework
  // findings aren't buried under example noise.
  {
    files: ["examples/**/*.{ts,tsx,js,jsx,mjs}"],
    rules: {
      "react/no-danger": "off",
      "jsx-a11y/no-autofocus": "off",
      "react/no-array-index-key": "off",
    },
  },

  // Test fixtures are minimal SSR stand-ins, not real documents — a fixture
  // <html> shell doesn't need a lang attribute.
  {
    files: ["packages/core/src/__tests__/fixtures/**/*.{ts,tsx,js,jsx}"],
    rules: {
      "jsx-a11y/html-has-lang": "off",
    },
  },

  // Must come last: turns off every stylistic rule that would fight Prettier.
  prettier,
);
