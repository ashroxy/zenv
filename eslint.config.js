import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'android/**', 'ios/**', 'coverage/**'] },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          // ESLint's own config file and the Node scripts are outside the app's
          // tsconfig include graph, so the project service cannot type them
          // without this. Keep this list minimal: every entry widens the set of
          // files ESLint will happily type-check outside the project.
          allowDefaultProject: ['eslint.config.js', 'scripts/*.mjs'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,

      // --- correctness ---
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/require-await': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unnecessary-condition': 'off',

      // --- hygiene ---
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },

  {
    files: ['services/cryptoUtils.ts', 'services/passwordGenerator.ts'],
    rules: {
      // The legacy derivation must stay byte-for-byte identical to the shipped
      // algorithm; its deprecation marker is intentional, not an oversight.
      '@typescript-eslint/no-deprecated': 'off',
    },
  },

  {
    files: ['components/Intro.tsx'],
    rules: {
      // The typing animation stores timer handles as `any` because it mixes
      // `setTimeout`/`setInterval` return types across DOM and Node typings.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
    },
  },

  {
    files: ['components/Vault.tsx', 'components/Generator.tsx', 'components/EditAccountModal.tsx', 'App.tsx'],
    rules: {
      // Revealing a password and then resetting it on key/profile change is
      // exactly the "derive state from a prop" case the rule targets, but here
      // the reset is a security requirement (drop plaintext when the session
      // changes), not an optimisation. Deriving it during render would leak a
      // stale password for one frame.
      'react-hooks/set-state-in-effect': 'off',
      // These handlers are async because the derivation is; the calls are
      // wrapped in `void` at the call site where fire-and-forget is intended.
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
    },
  },

  {
    files: ['**/*.test.ts', 'vitest.setup.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
    },
  },

  {
    files: ['vite.config.ts', 'vitest.config.ts', 'scripts/**/*.mjs'],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      // Node context: these run in Node, not the browser, and `js.configs.recommended`
      // has no way to know that. Declared explicitly to avoid depending on a
      // transitive copy of the `globals` package.
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        URL: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
      },
    },
  },
);