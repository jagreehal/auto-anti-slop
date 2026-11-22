// Copyright (c) 2026 Jag Reehal
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { spawnSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vite-plus/test';

const root = fileURLToPath(new URL('..', import.meta.url));
const setup = fileURLToPath(new URL('../bin/setup.js', import.meta.url));
const hook = fileURLToPath(new URL('../hooks/lint.mjs', import.meta.url));

const baselineOf = (count) => JSON.stringify({ 'gone.js': { 'no-eval': { count } } });

test('setup wires the lint hook for each agent and the hook reports changed files', async ({
  onTestFinished,
}) => {
  // Outside this repo, whose .gitignore would hide the project from Oxlint.
  const project = await mkdtemp(join(tmpdir(), 'auto-anti-slop-hooks-'));
  onTestFinished(() => rm(project, { force: true, recursive: true }));

  const run = (file, args, input = '') =>
    spawnSync(process.execPath, [file, ...args], {
      cwd: project,
      encoding: 'utf8',
      // Run Oxlint standalone, outside the Vite+ mode this test runner sets.
      env: { ...process.env, VP_VERSION: undefined },
      input,
    });

  const json = async (file) => JSON.parse(await readFile(join(project, file), 'utf8'));

  spawnSync('git', ['init', '-q', '--template='], { cwd: project });
  // Install the package: this repo's dependencies, plus the package itself.
  await mkdir(join(project, 'node_modules'));

  for (const entry of await readdir(join(root, 'node_modules'))) {
    await symlink(join(root, 'node_modules', entry), join(project, 'node_modules', entry));
  }

  await symlink(root, join(project, 'node_modules/auto-anti-slop'));
  // An existing config under another name stops setup from adding a second one.
  // Mentioning the package isn't using it: setup checks the config Oxlint resolves.
  await writeFile(join(project, '.oxlintrc.jsonc'), '// Adopt auto-anti-slop next.\n{}');
  await mkdir(join(project, '.claude'));
  await writeFile(join(project, '.claude/settings.json'), '{"model":"opus"}');

  const first = run(setup, []);
  expect(first.status, first.stderr).toBe(0);
  // A config without the preset is kept, but setup says so and won't baseline against it.
  expect(first.stderr).toContain(".oxlintrc.jsonc: doesn't use auto-anti-slop");
  await expect(readFile(join(project, 'oxlint.config.ts'))).rejects.toThrow('ENOENT');
  expect(run(setup, ['--baseline']).status).toBe(1);
  await expect(readFile(join(project, 'oxlint-suppressions.json'))).rejects.toThrow('ENOENT');
  // Registering the preset's plugins without its rules doesn't count either.
  await rm(join(project, '.oxlintrc.jsonc'));
  await writeFile(
    join(project, 'oxlint.config.ts'),
    "import preset from 'auto-anti-slop';\n\nexport default { jsPlugins: preset.jsPlugins, rules: { 'no-eval': 'error' } };\n",
  );
  expect(run(setup, ['--baseline']).status).toBe(1);
  await expect(readFile(join(project, 'oxlint-suppressions.json'))).rejects.toThrow('ENOENT');
  await rm(join(project, 'oxlint.config.ts'));
  // Nor does a large config of warnings.
  const categories = { correctness: 'warn', pedantic: 'warn', perf: 'warn', style: 'warn' };
  await writeFile(join(project, '.oxlintrc.json'), JSON.stringify({ categories }));
  expect(run(setup, ['--baseline']).status).toBe(1);
  await expect(readFile(join(project, 'oxlint-suppressions.json'))).rejects.toThrow('ENOENT');
  await rm(join(project, '.oxlintrc.json'));
  expect(run(setup, []).stdout).toContain('oxlint.config.ts: created');
  expect(run(setup, []).stdout).toContain('hook already present');
  const claude = await json('.claude/settings.json');
  expect(claude.model).toBe('opus');
  expect(claude.hooks.Stop).toHaveLength(1);
  expect((await json('.codex/hooks.json')).hooks.Stop).toHaveLength(1);
  expect((await json('.cursor/hooks.json')).hooks.stop).toHaveLength(1);
  await readFile(join(project, '.agents/skills/migrate-oxlint-config/SKILL.md'));
  const agents = await readFile(join(project, 'AGENTS.md'), 'utf8');
  expect(agents.match(/## Linting \(auto-anti-slop\)/g)).toHaveLength(1);

  // Clean: the generated config itself lints clean, so nothing is reported.
  const cleanRun = run(hook, ['claude'], '{}');
  expect(cleanRun.status, cleanRun.stderr).toBe(0);

  await writeFile(join(project, 'bad.js'), 'eval("1 + 2");\n');
  const claudeRun = run(hook, ['claude'], '{}');
  expect(claudeRun.status, claudeRun.stderr).toBe(2);
  expect(claudeRun.stderr).toContain('no-eval');
  expect(run(hook, ['codex'], '{"stop_hook_active":true}').status).toBe(0);
  // Malformed input is treated as a first attempt, not a crash.
  expect(run(hook, ['claude'], 'not json').status).toBe(2);

  const cursorRun = run(hook, ['cursor'], '{"status":"completed","loop_count":0}');
  expect(cursorRun.status).toBe(0);
  expect(JSON.parse(cursorRun.stdout).followup_message).toContain('no-eval');
  expect(run(hook, ['cursor'], '{"status":"completed","loop_count":1}').stdout).toBe('');
  expect(run(hook, ['cursor'], '{"status":"aborted","loop_count":0}').stdout).toBe('');
  expect(JSON.parse(run(hook, ['cursor'], 'not json').stdout).followup_message).toContain(
    'no-eval',
  );

  // The installed Cursor command works from a subdirectory, as it resolves the git root.
  const [{ command }] = (await json('.cursor/hooks.json')).hooks.stop;
  await mkdir(join(project, 'src'));

  const fromSubdirectory = spawnSync('sh', ['-c', command], {
    cwd: join(project, 'src'),
    encoding: 'utf8',
    env: { ...process.env, VP_VERSION: undefined },
    input: '{"status":"completed","loop_count":0}',
  });

  expect(JSON.parse(fromSubdirectory.stdout).followup_message, fromSubdirectory.stderr).toContain(
    'no-eval',
  );

  // Baseline: existing findings are recorded and don't block; new ones do; fixed ones shrink it.
  const twoEvals = 'eval("1 + 2");\n\neval("3 + 4");\n';

  await writeFile(join(project, 'bad.js'), twoEvals);
  expect(run(setup, ['--baseline']).status).toBe(0);
  expect((await json('oxlint-suppressions.json'))['bad.js']).toEqual({ 'no-eval': { count: 2 } });
  expect(run(hook, ['claude'], '{}').status).toBe(0);

  await writeFile(join(project, 'bad.js'), `${twoEvals}\neval("5 + 6");\n`);
  expect(run(hook, ['claude'], '{}').status).toBe(2);

  await writeFile(join(project, 'bad.js'), 'eval("1 + 2");\n');
  expect(run(hook, ['claude'], '{}').status).toBe(0);
  expect((await json('oxlint-suppressions.json'))['bad.js']).toEqual({ 'no-eval': { count: 1 } });

  // Deleting the file drops its entry, so a new file at that path doesn't inherit it.
  await rm(join(project, 'bad.js'));
  expect(run(hook, ['claude'], '{}').status).toBe(0);
  expect(await json('oxlint-suppressions.json')).toEqual({});
  await writeFile(join(project, 'bad.js'), 'eval("1 + 2");\n');
  expect(run(hook, ['claude'], '{}').status).toBe(2);

  // A malformed baseline doesn't stop the hook reporting findings, and isn't rewritten.
  for (const baseline of [
    'not json',
    '"bad.js"',
    baselineOf('garbled'),
    baselineOf(-1),
    baselineOf(0),
  ]) {
    await writeFile(join(project, 'oxlint-suppressions.json'), baseline);
    const malformed = run(hook, ['claude'], '{}');
    expect(malformed.status).toBe(2);
    expect(malformed.stderr).toContain('no-eval');
    expect(await readFile(join(project, 'oxlint-suppressions.json'), 'utf8')).toBe(baseline);
  }

  // A read-only baseline it can't prune doesn't stop the hook either.
  const readOnly = JSON.stringify({ 'gone.js': { 'no-eval': { count: 1 } } });
  await writeFile(join(project, 'oxlint-suppressions.json'), readOnly);
  await chmod(join(project, 'oxlint-suppressions.json'), 0o444);
  const unwritable = run(hook, ['claude'], '{}');
  expect(unwritable.status).toBe(2);
  expect(unwritable.stderr).toContain('no-eval');
  expect(await readFile(join(project, 'oxlint-suppressions.json'), 'utf8')).toBe(readOnly);
}, 60_000); // Each hook run starts a type-aware Oxlint.
