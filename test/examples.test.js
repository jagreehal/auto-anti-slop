// Copyright (c) 2026 Jag Reehal
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, test } from 'vite-plus/test';
import { run } from './run.js';

const examples = fileURLToPath(new URL('../examples', import.meta.url));
const oxlint = fileURLToPath(new URL('bin/oxlint', import.meta.resolve('oxlint/package.json')));
const config = fileURLToPath(new URL('examples.oxlint.ts', import.meta.url));
const entries = await readdir(examples, { withFileTypes: true });
const projects = entries.flatMap((entry) => (entry.isDirectory() ? [entry.name] : []));

describe('examples', () => {
  let report;

  // One Oxlint run covers every project; each file's nearest tsconfig.json types it.
  beforeAll(async () => {
    const result = await run(
      process.execPath,
      [oxlint, '-c', config, '--format=json', ...projects],
      {
        cwd: examples,
      },
    );

    // Not JSON when Oxlint can't start, so say why.
    if (!result.stdout.trimStart().startsWith('{')) {
      throw new Error(result.stdout + result.stderr);
    }

    report = JSON.parse(result.stdout);
  });

  const findings = (project) =>
    report.diagnostics
      .filter(({ filename }) => filename.startsWith(`${project}/`))
      .map(({ code, filename, labels }) => ({
        code,
        file: filename.slice(project.length + 1),
        line: labels[0].span.line,
      }))
      .toSorted(
        (a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.code.localeCompare(b.code),
      )
      .map(({ code, file, line }) => `${file}:${line} ${code}\n`)
      .join('');

  test('every source file is linted', async () => {
    const files = await readdir(examples, { recursive: true });
    expect(report.number_of_files).toBe(
      files.filter((file) => /\/src\/.*\.[jt]sx?$/.test(file)).length,
    );
    // A finding outside a project, such as a config error, would be in no snapshot.
    expect(
      report.diagnostics.filter(
        ({ filename }) => !projects.some((project) => filename?.startsWith(`${project}/`)),
      ),
    ).toEqual([]);
  });

  test('clean has no findings', () => {
    expect(findings('clean')).toBe('');
  });

  test.for(projects.filter((project) => project !== 'clean'))('%s', async (project) => {
    await expect(findings(project)).toMatchFileSnapshot(join(examples, project, 'findings.txt'));
  });
});
