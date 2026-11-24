// Copyright (c) 2026 Jag Reehal
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rules } from 'eslint-plugin-sonarjs';
import { expect, test } from 'vite-plus/test';
import { run } from './run.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const oxlint = fileURLToPath(new URL('bin/oxlint', import.meta.resolve('oxlint/package.json')));

test('sonarjs.json has what Oxlint reads when it registers each rule', async () => {
  const registrations = Object.entries(rules).flatMap(([name, { meta }]) => {
    const { defaultOptions, fixable, hasSuggestions, schema } = meta;

    return name === 'cognitive-complexity'
      ? []
      : [[name, { defaultOptions, fixable, hasSuggestions, schema }]];
  });

  // After upgrading eslint-plugin-sonarjs, `vp test sonarjs -u` rewrites it.
  await expect(
    `${JSON.stringify(Object.fromEntries(registrations), null, 2)}\n`,
  ).toMatchFileSnapshot('../rules/sonarjs.json');
});

test('a project can turn on any sonarjs rule', async ({ onTestFinished }) => {
  const project = await mkdtemp(join(root, '.consumer-'));
  onTestFinished(() => rm(project, { force: true, recursive: true }));
  await writeFile(
    join(project, 'oxlint.config.ts'),
    "import preset from 'auto-anti-slop';\n\nexport default { jsPlugins: preset.jsPlugins, rules: { 'sonarjs/no-identical-conditions': 'error' } };\n",
  );
  await writeFile(join(project, 'a.js'), 'if (a) {\n  b();\n} else if (a) {\n  c();\n}\n');

  const result = await run(process.execPath, [oxlint, '--format=json', '--no-ignore', 'a.js'], {
    cwd: project,
  });

  const findings = JSON.parse(result.stdout).diagnostics.filter(
    ({ code }) => code === 'sonarjs(no-identical-conditions)',
  );

  expect(findings, result.stdout + result.stderr).toHaveLength(1);
  expect(findings[0].message).toContain('line 1');
});

test.for([
  ['an invalid option', { fomrat: '^z+$' }, 'Unexpected property "fomrat"'],
  ['a valid option', { format: '^z+$' }, 'function-name'],
])('%s reaches the rule', async ([, options, output], { onTestFinished }) => {
  const project = await mkdtemp(join(root, '.consumer-'));
  onTestFinished(() => rm(project, { force: true, recursive: true }));
  await writeFile(
    join(project, 'oxlint.config.ts'),
    `import preset from 'auto-anti-slop';\n\nexport default { jsPlugins: preset.jsPlugins, rules: { 'sonarjs/function-name': ['error', ${JSON.stringify(options)}] } };\n`,
  );
  await writeFile(join(project, 'a.js'), 'export function a() {}\n');

  const result = await run(process.execPath, [oxlint, '--no-ignore', 'a.js'], { cwd: project });

  expect(result.status).toBe(1);
  expect(result.stdout + result.stderr).toContain(output);
});
