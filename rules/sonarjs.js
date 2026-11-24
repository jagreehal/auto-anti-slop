// Copyright (c) 2026 Jag Reehal
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

// Loading all of eslint-plugin-sonarjs takes most of a lint run's time, and the preset uses one
// rule. Register every rule, so projects can turn any of them on, but load the others on first use.
// The package is pinned to an exact version because these paths are internal to it.
import { createRequire } from 'node:module';
import { rule as cognitiveComplexity } from 'eslint-plugin-sonarjs/cjs/S3776/rule.js';
import registrations from './sonarjs.json' with { type: 'json' };

const require = createRequire(import.meta.url);

function lazyRule(name, registration) {
  // Oxlint keeps this object when it registers the rule, and reads it when the rule reports.
  const messages = {};

  return {
    create(context) {
      const rule = require('eslint-plugin-sonarjs').rules[name];
      Object.assign(messages, rule.meta.messages);

      return rule.create(context);
    },
    meta: { ...registration, messages },
  };
}

const lazyRules = Object.entries(registrations).map(([name, registration]) => [
  name,
  lazyRule(name, registration),
]);

export default {
  meta: { name: 'sonarjs' },
  rules: { ...Object.fromEntries(lazyRules), 'cognitive-complexity': cognitiveComplexity },
};
