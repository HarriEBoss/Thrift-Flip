// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

/** APIs game code must never touch directly (YouTube Playables + architecture rules). */
const restrictedGlobals = [
  ['localStorage', 'Use platform.loadSave/writeSave.'],
  ['sessionStorage', 'Use platform.loadSave/writeSave.'],
  ['indexedDB', 'Use platform.loadSave/writeSave.'],
  ['fetch', 'No network calls in game code.'],
  ['XMLHttpRequest', 'No network calls in game code.'],
  ['WebSocket', 'No network calls in game code.'],
  ['eval', 'eval is forbidden.'],
  ['Function', 'The Function constructor is forbidden.'],
  ['Worker', 'Web Workers are forbidden.'],
  ['SharedWorker', 'Web Workers are forbidden.'],
  ['WebAssembly', 'WebAssembly is forbidden.'],
  ['ytgame', 'Only src/platform/youtube may touch ytgame.'],
].map(([name, message]) => ({ name, message }));

const restrictedProperties = [
  ['document', 'cookie', 'Cookies are forbidden.'],
  ['document', 'hidden', 'Use platform.onPause/onResume.'],
  ['document', 'visibilityState', 'Use platform.onPause/onResume.'],
  ['navigator', 'language', 'Use platform.getLanguage().'],
  ['navigator', 'languages', 'Use platform.getLanguage().'],
  ['navigator', 'clipboard', 'Clipboard access is forbidden.'],
  ['window', 'open', 'External links/windows are forbidden in game code.'],
  ['window', 'localStorage', 'Use platform.loadSave/writeSave.'],
  ['window', 'sessionStorage', 'Use platform.loadSave/writeSave.'],
  ['window', 'indexedDB', 'Use platform.loadSave/writeSave.'],
  ['window', 'fetch', 'No network calls in game code.'],
  ['window', 'ytgame', 'Only src/platform/youtube may touch ytgame.'],
  ['globalThis', 'ytgame', 'Only src/platform/youtube may touch ytgame.'],
  ['globalThis', 'localStorage', 'Use platform.loadSave/writeSave.'],
  ['globalThis', 'fetch', 'No network calls in game code.'],
].map(([object, property, message]) => ({ object, property, message }));

const restrictedSyntax = [
  {
    selector: "Literal[value='visibilitychange']",
    message: 'Do not use the Page Visibility API; use platform.onPause/onResume.',
  },
  { selector: "NewExpression[callee.name='Function']", message: 'The Function constructor is forbidden.' },
  { selector: "NewExpression[callee.name='Worker']", message: 'Web Workers are forbidden.' },
  { selector: "CallExpression[callee.name='eval']", message: 'eval is forbidden.' },
  {
    selector: "MemberExpression[property.name='ytgame']",
    message: 'Only src/platform/youtube may touch ytgame.',
  },
];

export default tseslint.config(
  {
    ignores: [
      'node_modules',
      'dist',
      'dist-*',
      'coverage',
      'ios',
      'android',
      'test-results',
      'playwright-report',
      '**/*.json',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        __PLATFORM__: 'readonly',
        __E2E__: 'readonly',
        __APP_VERSION__: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    files: ['src/**/*.ts'],
    ignores: ['src/platform/**'],
    rules: {
      'no-restricted-globals': ['error', ...restrictedGlobals],
      'no-restricted-properties': ['error', ...restrictedProperties],
      'no-restricted-syntax': ['error', ...restrictedSyntax],
    },
  },
  {
    // Pure core: no Phaser, no DOM.
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: ['phaser', '../game/*', '../platform/*'] }],
    },
  },
);
