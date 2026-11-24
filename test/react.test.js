// Copyright (c) 2026 Jag Reehal
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vite-plus/test';
import { run } from './run.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const oxlint = fileURLToPath(new URL('bin/oxlint', import.meta.resolve('oxlint/package.json')));

// Not React: `class` and an unlabelled image would fail React and accessibility rules.
const source = `import { useEffect } from 'react';

export function Avatar({ url }) {
  useEffect(() => {
    document.title = url;
  }, []);

  return <img class="avatar" src={url} />;
}
`;

async function lint(config, onTestFinished) {
  const project = await mkdtemp(join(root, '.consumer-'));
  onTestFinished(() => rm(project, { force: true, recursive: true }));
  await writeFile(join(project, 'oxlint.config.ts'), config);
  await writeFile(join(project, 'a.jsx'), source);

  const result = await run(process.execPath, [oxlint, '--format=json', '--no-ignore', 'a.jsx'], {
    cwd: project,
  });

  return JSON.parse(result.stdout)
    .diagnostics.map(({ code }) => code)
    .toSorted();
}

test('the preset has no React or accessibility rules', async ({ onTestFinished }) => {
  const config = "import preset from 'auto-anti-slop';\n\nexport default preset;\n";

  expect(await lint(config, onTestFinished)).toEqual([]);
});

test('the README recipe adds them', async ({ onTestFinished }) => {
  const readme = await readFile(join(root, 'README.md'), 'utf8');
  const [, recipe] = /### React and other JSX[\s\S]*?```ts\n([\s\S]*?)```/.exec(readme);

  expect(await lint(recipe, onTestFinished)).toEqual([
    'jsx-a11y(alt-text)',
    'react-hooks(exhaustive-deps)',
  ]);
});
