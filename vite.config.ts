// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { defineConfig } from 'vite-plus';
import preset from './index.js';

export default defineConfig({
  fmt: {
    ignorePatterns: ['pnpm-lock.yaml', '.consumer-*'],
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
    // Vendored from anti-slop; kept close to upstream rather than restyled.
    ignorePatterns: ['.consumer-*/', 'anti-slop/'],
    options: { typeAware: true, typeCheck: true },
    // Command-line scripts report through the console.
    overrides: [{ files: ['bin/**', 'hooks/**'], rules: { 'no-console': 'off' } }],
  },
  staged: {
    '*': 'vp check --fix',
  },
});
