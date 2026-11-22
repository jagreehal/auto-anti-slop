// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import type { OxlintConfig } from 'oxlint';

// Required, so projects can spread these into their own config.
declare const config: OxlintConfig &
  Required<Pick<OxlintConfig, 'ignorePatterns' | 'overrides' | 'rules'>>;

export default config;
