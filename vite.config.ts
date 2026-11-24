// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { defineConfig } from 'vite-plus';
import preset from './index.js';

export default defineConfig({
  fmt: {
    ignorePatterns: ['pnpm-lock.yaml', '.consumer-*', 'rules/sonarjs.json'],
    singleQuote: true,
    sortImports: {
      newlinesBetween: false,
    },
    sortPackageJson: {
      sortScripts: true,
    },
  },
  lint: {
    env: { node: true },
    // Lint this repo with its own preset.
    extends: [preset],
    // `anti-slop/` keeps its own style, and test/examples.test.js lints the examples.
    ignorePatterns: ['.consumer-*/', 'anti-slop/', 'examples/'],
    options: { typeAware: true, typeCheck: true },
    // Command-line scripts report through the console.
    overrides: [{ files: ['bin/**', 'hooks/**'], rules: { 'no-console': 'off' } }],
  },
  staged: {
    '*': 'vp check --fix',
  },
  test: {
    // The examples hold test files of their own, to lint rather than run.
    include: ['{anti-slop,rules,test}/**/*.test.js'],
    // Starting Oxlint is slow on a busy machine.
    hookTimeout: 60_000,
    testTimeout: 60_000,
  },
});
