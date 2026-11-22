// Copyright (c) 2026 Jag Reehal
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { spawnSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vite-plus/test';

const root = fileURLToPath(new URL('..', import.meta.url));
const docs = join(root, 'docs/rules');
const oxlint = fileURLToPath(new URL('bin/oxlint', import.meta.resolve('oxlint/package.json')));

// `# \`anti-slop/no-x\`` → `anti-slop(no-x)`; a built-in rule such as `complexity` → `eslint(complexity)`.
const diagnosticCode = (title) => {
  const [plugin, rule] = title.includes('/') ? title.split('/') : ['eslint', title];

  return `${plugin}(${rule})`;
};

const report = (bad, good) => ({ 'bad reports the rule': bad, 'good diagnostics': good });

const example = (page, heading) =>
  page.split(`## ${heading}\n\n\`\`\`ts\n`)[1]?.split('\n```')[0] ?? null;

test('every rule page has a bad example the rule reports and a good one the preset accepts', async ({
  onTestFinished,
}) => {
  const project = await mkdtemp(join(root, '.consumer-'));
  onTestFinished(() => rm(project, { force: true, recursive: true }));

  const expected = {};

  for (const file of (await readdir(docs)).filter((name) => name.endsWith('.md'))) {
    const page = await readFile(join(docs, file), 'utf8');
    const name = file.replace(/\.md$/, '');
    const bad = example(page, '❌ Bad');
    const good = example(page, '✅ Good');
    expect(bad, `${file} needs a ❌ Bad ts block`).not.toBeNull();
    expect(good, `${file} needs a ✅ Good ts block`).not.toBeNull();
    await writeFile(join(project, `${name}.bad.ts`), `${bad}\n`);
    await writeFile(join(project, `${name}.good.ts`), `${good}\n`);
    expected[name] = diagnosticCode(/^# `([^`]+)`/.exec(page)[1]);
  }

  await writeFile(
    join(project, 'oxlint.config.ts'),
    "import preset from 'auto-anti-slop';\nimport { defineConfig } from 'oxlint';\n\nexport default defineConfig({ ...preset });\n",
  );
  await writeFile(
    join(project, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: { noEmit: true, strict: true, types: [] },
      include: ['*.ts'],
    }),
  );

  const files = Object.keys(expected).flatMap((name) => [`${name}.bad.ts`, `${name}.good.ts`]);

  const result = spawnSync(process.execPath, [oxlint, '--format=json', '--no-ignore', ...files], {
    cwd: project,
    encoding: 'utf8',
    env: { ...process.env, VP_VERSION: undefined },
  });

  expect(result.stdout, result.stderr).toMatch(/^\s*\{/);
  const codes = {};

  for (const { code, filename } of JSON.parse(result.stdout).diagnostics) {
    (codes[filename] ??= []).push(code);
  }

  expect(
    Object.fromEntries(
      Object.entries(expected).map(([name, code]) => [
        name,
        report((codes[`${name}.bad.ts`] ?? []).includes(code), codes[`${name}.good.ts`] ?? []),
      ]),
    ),
  ).toEqual(Object.fromEntries(Object.keys(expected).map((name) => [name, report(true, [])])));
});
