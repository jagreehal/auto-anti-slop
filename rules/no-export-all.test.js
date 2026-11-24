// Copyright (c) 2026 Jag Reehal
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { RuleTester } from 'oxlint/plugins-dev';
import { describe, it } from 'vite-plus/test';
import { noExportAllRule } from './no-export-all.js';

RuleTester.describe = describe;

RuleTester.it = it;

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: 'ts' } } });
const error = { messageId: 'exportAll' };

tester.run('anti-slop/no-export-all', noExportAllRule, {
  valid: ["export { load } from './store';", "export * from 'react';"],
  invalid: [
    { code: "export * from './store';", errors: [error] },
    { code: "export * from '../store';", errors: [error] },
    { code: "export * as store from './store';", errors: [error] },
    { code: "export type * from './store';", errors: [error] },
  ],
});
