import tsPlugin from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import sveltePlugin from 'eslint-plugin-svelte'
import svelteParser from 'svelte-eslint-parser'

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'data/**']
  },
  {
    files: ['**/*.ts'],
    plugins: { '@typescript-eslint': tsPlugin },
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' }
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }]
    }
  },
  {
    files: ['**/*.svelte'],
    plugins: { svelte: sveltePlugin, '@typescript-eslint': tsPlugin },
    languageOptions: {
      parser: svelteParser,
      parserOptions: { parser: tsParser }
    },
    rules: {
      ...sveltePlugin.configs.recommended.rules
    }
  }
]
