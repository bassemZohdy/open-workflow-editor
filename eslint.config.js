export default [
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        Blob: 'readonly',
        DataTransfer: 'readonly',
        DragEvent: 'readonly',
        FileReader: 'readonly',
        HTMLInputElement: 'readonly',
        HTMLTextAreaElement: 'readonly',
        URL: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        process: 'readonly',
        fetch: 'readonly',
        window: 'readonly',
      },
    },
    rules: {
      'no-constant-binary-expression': 'error',
      'no-duplicate-imports': 'error',
      'no-new-wrappers': 'error',
      'no-undef': 'error',
      'no-unused-vars': ['error', { args: 'none', ignoreRestSiblings: true }],
    },
  },
  {
    files: ['**/*.test.js'],
    languageOptions: {
      globals: {
        describe: 'readonly',
        expect: 'readonly',
        it: 'readonly',
      },
    },
  },
];
