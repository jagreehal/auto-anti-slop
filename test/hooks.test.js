// Copyright (c) 2026 Jag Reehal
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import {
  chmod,
  link,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vite-plus/test';
import { run } from './run.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const setupScript = fileURLToPath(new URL('../bin/setup.js', import.meta.url));
const hookScript = fileURLToPath(new URL('../hooks/lint.mjs', import.meta.url));

const baselineOf = (count) => JSON.stringify({ 'gone.js': { 'no-eval': { count } } });
const firstStop = '{"status":"completed","loop_count":0}';

const permissions = async (path) => (await lstat(path)).mode.toString(8).slice(-3);

// A nested config, read after the root config, that acts once the scan has run.
const acting = (action) =>
  `import { existsSync, mkdirSync, utimesSync, writeFileSync } from 'node:fs';\n\nconst scanned = new URL('./scanned', import.meta.url);\nconst root = (file) => new URL(\`../\${file}\`, import.meta.url);\n\nif (!process.argv.includes('--print-config')) {\n  writeFileSync(scanned, '');\n} else if (existsSync(scanned)) {\n  ${action}\n}\n\nexport default {};\n`;

/** A git repository with the package installed, removed when the test ends. */
async function createProject(onTestFinished) {
  // Outside this repo, whose .gitignore would hide the project from Oxlint.
  const dir = await mkdtemp(join(tmpdir(), 'auto-anti-slop-hooks-'));
  onTestFinished(() => rm(dir, { force: true, recursive: true }));
  spawnSync('git', ['init', '-q', '--template='], { cwd: dir });
  // Install the package: this repo's dependencies, plus the package itself.
  await mkdir(join(dir, 'node_modules'));

  for (const entry of await readdir(join(root, 'node_modules'))) {
    await symlink(join(root, 'node_modules', entry), join(dir, 'node_modules', entry));
  }

  await symlink(root, join(dir, 'node_modules/auto-anti-slop'));

  const read = (file) => readFile(join(dir, file), 'utf8');

  return {
    dir,
    hook: (agent, input = '{}') => run(process.execPath, [hookScript, agent], { cwd: dir, input }),
    json: async (file) => JSON.parse(await read(file)),
    read,
    remove: (file) => rm(join(dir, file)),
    setup: (...args) => run(process.execPath, [setupScript, ...args], { cwd: dir }),
    write: (file, content) => writeFile(join(dir, file), content),
  };
}

describe.concurrent('setup and hook', () => {
  test('setup keeps a config without the preset and refuses to baseline it', async ({
    onTestFinished,
  }) => {
    const project = await createProject(onTestFinished);

    const rejectsBaseline = async () => {
      expect((await project.setup('--baseline')).status).toBe(1);
      await expect(project.read('oxlint-suppressions.json')).rejects.toThrow('ENOENT');
    };

    // An existing config under another name stops setup from adding a second one.
    // Mentioning the package isn't using it: setup checks the config Oxlint resolves.
    await project.write('.oxlintrc.jsonc', '// Adopt auto-anti-slop next.\n{}');
    const first = await project.setup();
    expect(first.status, first.stderr).toBe(0);
    expect(first.stderr).toContain(".oxlintrc.jsonc: doesn't use auto-anti-slop");
    await expect(project.read('oxlint.config.ts')).rejects.toThrow('ENOENT');
    await rejectsBaseline();
    await project.remove('.oxlintrc.jsonc');

    // Registering the preset's plugins without its rules doesn't count either.
    await project.write(
      'oxlint.config.ts',
      "import preset from 'auto-anti-slop';\n\nexport default { jsPlugins: preset.jsPlugins, rules: { 'no-eval': 'error' } };\n",
    );
    await rejectsBaseline();
    await project.remove('oxlint.config.ts');

    const categories = { correctness: 'warn', pedantic: 'warn', perf: 'warn', style: 'warn' };
    await project.write('.oxlintrc.json', JSON.stringify({ categories }));
    await rejectsBaseline();
  });

  test('setup wires the lint hook for each agent once', async ({ onTestFinished }) => {
    const project = await createProject(onTestFinished);
    await mkdir(join(project.dir, '.claude'));
    await project.write('.claude/settings.json', '{"model":"opus"}');

    expect((await project.setup()).stdout).toContain('oxlint.config.ts: created');
    expect((await project.setup()).stdout).toContain('hook already present');
    await expect(project.read('oxlint-suppressions.json')).rejects.toThrow('ENOENT');
    const claude = await project.json('.claude/settings.json');
    expect(claude.model).toBe('opus');
    expect(claude.hooks.Stop).toHaveLength(1);
    expect((await project.json('.codex/hooks.json')).hooks.Stop).toHaveLength(1);
    expect((await project.json('.cursor/hooks.json')).hooks.stop).toHaveLength(1);
    await project.read('.agents/skills/migrate-oxlint-config/SKILL.md');
    const agents = await project.read('AGENTS.md');
    expect(agents.match(/## Linting \(auto-anti-slop\)/g)).toHaveLength(1);
  });

  test('the hook reports changed files to each agent', async ({ onTestFinished }) => {
    const project = await createProject(onTestFinished);
    await project.setup();

    const cleanRun = await project.hook('claude');
    expect(cleanRun.status, cleanRun.stderr).toBe(0);

    await project.write('bad.js', 'eval("1 + 2");\n');
    // The installed Cursor command works from a subdirectory, as it resolves the git root.
    const [{ command }] = (await project.json('.cursor/hooks.json')).hooks.stop;
    await mkdir(join(project.dir, 'src'));

    const [
      claude,
      codexRetry,
      malformed,
      cursor,
      cursorRetry,
      cursorAborted,
      cursorMalformed,
      sub,
    ] = await Promise.all([
      project.hook('claude'),
      project.hook('codex', '{"stop_hook_active":true}'),
      project.hook('claude', 'not json'),
      project.hook('cursor', firstStop),
      project.hook('cursor', '{"status":"completed","loop_count":1}'),
      project.hook('cursor', '{"status":"aborted","loop_count":0}'),
      project.hook('cursor', 'not json'),
      run('sh', ['-c', command], { cwd: join(project.dir, 'src'), input: firstStop }),
    ]);

    expect(claude.status, claude.stderr).toBe(2);
    expect(claude.stderr).toContain('no-eval');
    expect(codexRetry.status).toBe(0);
    expect(malformed.status).toBe(2);
    expect(cursor.status).toBe(0);
    expect(JSON.parse(cursor.stdout).followup_message).toContain('no-eval');
    expect(cursorRetry.stdout).toBe('');
    expect(cursorAborted.stdout).toBe('');
    expect(JSON.parse(cursorMalformed.stdout).followup_message).toContain('no-eval');
    expect(JSON.parse(sub.stdout).followup_message, sub.stderr).toContain('no-eval');
  });

  test('the baseline blocks new findings, not recorded ones, and only shrinks', async ({
    onTestFinished,
  }) => {
    const project = await createProject(onTestFinished);
    const twoEvals = 'eval("1 + 2");\n\neval("3 + 4");\n';
    await project.write('bad.js', twoEvals);
    // A baseline can't record an unused directive, so it mustn't fail setup.
    await project.write(
      'directive.js',
      '// eslint-disable-next-line react-hooks/exhaustive-deps\nexport const a = 1;\n',
    );
    const first = await project.setup();
    expect(first.status, first.stderr).toBe(0);
    expect(first.stdout).toContain('recorded existing findings');
    expect((await project.json('oxlint-suppressions.json'))['bad.js']).toEqual({
      'no-eval': { count: 2 },
    });
    expect((await project.hook('claude')).status).toBe(0);

    await project.write('bad.js', `${twoEvals}\neval("5 + 6");\n`);
    expect((await project.hook('claude')).status).toBe(2);

    // Running setup again, or recreating the config, doesn't hide the new finding.
    await project.setup();
    await project.remove('oxlint.config.ts');
    await project.setup();
    expect((await project.hook('claude')).status).toBe(2);

    await project.write('bad.js', 'eval("1 + 2");\n');
    expect((await project.hook('claude')).status).toBe(0);
    expect((await project.json('oxlint-suppressions.json'))['bad.js']).toEqual({
      'no-eval': { count: 1 },
    });

    const before = await project.read('oxlint-suppressions.json');
    await project.write('new.js', 'eval("5 + 6");\n');
    await project.write('broken.js', 'export const a = ;\n');
    expect((await project.setup('--baseline')).status).toBe(1);
    expect(await project.read('oxlint-suppressions.json')).toBe(before);
    await project.remove('broken.js');
    expect((await project.hook('claude')).status).toBe(2);

    await project.remove('directive.js');
    const baseline = join(project.dir, 'oxlint-suppressions.json');
    await chmod(baseline, 0o444);
    expect((await project.setup('--baseline')).status).toBe(1);
    expect(await project.read('oxlint-suppressions.json')).toBe(before);
    await chmod(baseline, 0o644);

    const child = spawn(process.execPath, [setupScript, '--baseline'], {
      cwd: project.dir,
      env: { ...process.env, VP_VERSION: undefined },
    });

    child.stdout.on('data', (data) => {
      if (String(data).includes('recording existing findings')) {
        child.kill('SIGTERM');
      }
    });
    expect(await once(child, 'close')).toEqual([143, null]);
    expect(await project.read('oxlint-suppressions.json')).toBe(before);
    await project.remove('new.js');

    // Deleting the file drops its entry, so a new file at that path doesn't inherit it.
    await project.remove('bad.js');
    expect((await project.hook('claude')).status).toBe(0);
    expect(await project.json('oxlint-suppressions.json')).toEqual({});
    await project.write('bad.js', 'eval("1 + 2");\n');
    expect((await project.hook('claude')).status).toBe(2);
  });

  test('a first setup that cannot record every error can be run again', async ({
    onTestFinished,
  }) => {
    const project = await createProject(onTestFinished);
    await project.write('bad.js', 'eval("1 + 2");\n');
    await project.write('broken.js', 'export const a = ;\n');

    const failed = await project.setup();
    expect(failed.status).toBe(1);
    expect(failed.stdout + failed.stderr).toContain('broken.js');
    await expect(project.read('oxlint-suppressions.json')).rejects.toThrow('ENOENT');
    await expect(project.read('oxlint.config.ts')).rejects.toThrow('ENOENT');

    await project.write('broken.js', 'export const a = 1;\n');
    const retried = await project.setup();
    expect(retried.status, retried.stderr).toBe(0);
    expect((await project.json('oxlint-suppressions.json'))['bad.js']).toEqual({
      'no-eval': { count: 1 },
    });
    expect((await project.hook('claude')).status).toBe(0);
  });

  test('a first setup lints the files a normal run would', async ({ onTestFinished }) => {
    const project = await createProject(onTestFinished);
    await project.write('bad.js', 'eval("1 + 2");\n');

    // No .gitignore: only the preset keeps dependencies out.
    for (const dir of ['node_modules/dep', 'packages/a/node_modules/dep']) {
      await mkdir(join(project.dir, dir), { recursive: true });
      await project.write(`${dir}/broken.js`, 'export const a = ;\n');
    }

    const setup = await project.setup();
    expect(setup.status, setup.stderr).toBe(0);
    expect(await project.json('oxlint-suppressions.json')).toEqual({
      'bad.js': { 'no-eval': { count: 1 } },
    });
    expect((await run('npx', ['--no-install', 'oxlint'], { cwd: project.dir })).status).toBe(0);
  });

  test('only --baseline replaces a baseline created during the scan', async ({
    onTestFinished,
  }) => {
    const setupDuringWrite = async (...args) => {
      const project = await createProject(onTestFinished);
      await project.write('bad.js', 'eval("1 + 2");\n');

      const child = spawn(process.execPath, [setupScript, ...args], {
        cwd: project.dir,
        env: { ...process.env, VP_VERSION: undefined },
      });

      let written = Promise.resolve();
      child.stdout.on('data', (data) => {
        if (String(data).includes('recording existing findings')) {
          written = project.write('oxlint-suppressions.json', baselineOf(1));
        }
      });
      expect(await once(child, 'close')).toEqual([0, null]);
      await written;
      await project.read('oxlint.config.ts');

      return project.read('oxlint-suppressions.json');
    };

    expect(await setupDuringWrite()).toBe(baselineOf(1));
    expect(JSON.parse(await setupDuringWrite('--baseline'))).toEqual({
      'bad.js': { 'no-eval': { count: 1 } },
    });
  });

  test('setup stops if a config is created during the scan', async ({ onTestFinished }) => {
    const setupDuringWrite = async (config, content) => {
      const project = await createProject(onTestFinished);
      await project.write('bad.js', 'eval("1 + 2");\n');

      const child = spawn(process.execPath, [setupScript], {
        cwd: project.dir,
        env: { ...process.env, VP_VERSION: undefined },
      });

      let stderr = '';
      let written = Promise.resolve();
      child.stderr.on('data', (data) => (stderr += data));
      child.stdout.on('data', (data) => {
        if (String(data).includes('recording existing findings')) {
          written = project.write(config, content);
        }
      });
      expect(await once(child, 'close')).toEqual([1, null]);
      await written;
      expect(stderr).toContain(`${config}: created during setup`);
      expect(new Set(await readdir(project.dir))).toEqual(
        new Set(['.git', config, 'bad.js', 'node_modules']),
      );
      expect(await project.read(config)).toBe(content);
      expect((await project.setup()).status).toBe(0);
    };

    await setupDuringWrite('.oxlintrc.json', '{}');
    await setupDuringWrite(
      'oxlint.config.ts',
      "import preset from 'auto-anti-slop';\n\nexport default { ...preset };\n",
    );
  });

  test('--baseline stops if the config changes during the scan', async ({ onTestFinished }) => {
    const project = await createProject(onTestFinished);
    await project.write('bad.js', 'eval("1 + 2");\n');
    await project.write(
      'oxlint.config.ts',
      "import { createReadStream, readFileSync } from 'node:fs';\nimport preset from 'auto-anti-slop';\nimport extra from './extra.js';\n\nreadFileSync('data.txt');\ncreateReadStream('stream.txt').resume();\n\nexport default { ...preset, ignorePatterns: [...preset.ignorePatterns, 'new'], ...extra };\n",
    );
    await project.write('extra.js', 'export default {};\n');
    await project.write('data.txt', 'data\n');
    await project.write('stream.txt', 'data\n');
    await project.write('base,].json', '{}');
    await project.write('oxlint-suppressions.json', baselineOf(1));

    const setupDuringChange = async (change, problem = 'oxlint.config.ts: changed') => {
      const child = spawn(process.execPath, [setupScript, '--baseline'], {
        cwd: project.dir,
        env: { ...process.env, VP_VERSION: undefined },
      });

      let stderr = '';
      let written = Promise.resolve();
      child.stderr.on('data', (data) => (stderr += data));
      child.stdout.on('data', (data) => {
        if (String(data).includes('recording existing findings')) {
          written = change();
        }
      });
      expect(await once(child, 'close')).toEqual([1, null]);
      await written;
      expect(stderr).toContain(`${problem} during setup`);
      expect(await project.read('oxlint-suppressions.json')).toBe(baselineOf(1));
    };

    const setupDuringWrite = (file, content, problem) =>
      setupDuringChange(() => project.write(file, content), problem);

    // Nested configs count too, including in hidden directories.
    const nested = join('.nested', 'oxlint.config.ts');
    await mkdir(join(project.dir, '.nested'));
    await project.write('.nested/extra.js', "export default 'error';\n");
    await project.write(
      nested,
      "import alert from './extra.js';\n\nexport default { rules: { 'no-alert': alert } };\n",
    );
    await setupDuringWrite('.nested/extra.js', "export default 'off';\n", `${nested}: changed`);
    await setupDuringWrite(nested, 'export default {};\n', `${nested}: changed`);
    // A directory that appears during the scan counts, and so does a config rewritten unchanged.
    const later = join('later', '.oxlintrc.json');
    await setupDuringChange(async () => {
      await mkdir(join(project.dir, 'later'));
      await project.write('later/bad.js', 'eval("1 + 2");\n');
      await project.write(later, '{}');
    }, `${later}: created`);
    await setupDuringWrite('oxlint.config.ts', await project.read('oxlint.config.ts'));
    await setupDuringWrite('extra.js', await project.read('extra.js'));
    await setupDuringWrite('data.txt', 'data\n');
    await setupDuringWrite('stream.txt', 'data\n');
    // A file a JSON config extends counts too.
    const extending = join('extending', '.oxlintrc.json');
    await mkdir(join(project.dir, 'extending'));
    await project.write('extending/a.js', 'export const a = 1;\n');
    await project.write(
      extending,
      '{\n  // "extends": ["./example.json"],\n  "extends": ["../base,].json"],\n}',
    );
    await setupDuringWrite('base,].json', '{}', `${extending}: changed`);

    // Oxlint loads configs in dependencies that git doesn't ignore.
    const dependency = join('node_modules', 'dep', '.oxlintrc.json');
    await mkdir(join(project.dir, 'node_modules/dep'));
    await project.write('node_modules/dep/index.js', 'export {};\n');
    await project.write(dependency, '{}');
    await setupDuringWrite(dependency, '{"rules":{}}', `${dependency}: changed`);
    await rm(join(project.dir, 'node_modules/dep'), { recursive: true });

    // A nested config lints files that the root config ignores.
    await mkdir(join(project.dir, 'new'));
    await project.write('new/bad.js', 'eval("1 + 2");\n');
    const created = join('new', '.oxlintrc.json');
    await setupDuringWrite(created, '{}', `${created}: created`);

    await setupDuringWrite('extra.js', "export default { rules: { 'no-eval': 'off' } };\n");
    await project.write('extra.js', 'export default {};\n');
    await setupDuringWrite(
      'oxlint.config.ts',
      "export default { ignorePatterns: ['**/node_modules/**'] };\n",
    );

    await project.write(
      'oxlint.config.ts',
      "import preset from 'auto-anti-slop';\n\nexport default { ...preset };\n",
    );
    expect((await project.setup('--baseline')).status).toBe(0);
    expect((await project.json('oxlint-suppressions.json'))['bad.js']).toBeDefined();
  }, 180_000);

  test('a config can start workers and child processes', async ({ onTestFinished }) => {
    const project = await createProject(onTestFinished);
    await project.write('bad.js', 'eval("1 + 2");\n');
    await project.write(
      'oxlint.config.ts',
      `import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { Worker } from 'node:worker_threads';
import preset from 'auto-anti-slop';

const script = new URL('cwd.mjs', import.meta.url);
const [workerCwd] = await once(new Worker(script), 'message');
const childCwd = execFileSync(process.execPath, [...process.execArgv, script.pathname]).toString();
const rules = workerCwd === process.cwd() && childCwd === process.cwd() ? { ...preset.rules, 'no-eval': 'error' } : { ...preset.rules, 'no-eval': 'off' };

export default { ...preset, rules };
`,
    );
    await project.write(
      'cwd.mjs',
      "import './load.mjs';\nimport { parentPort } from 'node:worker_threads';\nawait import(new URL('load.mjs', import.meta.url).href);\nif (parentPort) parentPort.postMessage(process.cwd());\nelse process.stdout.write(process.cwd());\n",
    );
    await project.write('load.mjs', 'export {};\n');

    const setup = await project.setup('--baseline');
    expect(setup.status, setup.stderr).toBe(0);
    expect((await project.json('oxlint-suppressions.json'))['bad.js']).toEqual({
      'no-eval': { count: 1 },
    });
  });

  test('setup leaves configs in ignored directories alone', async ({ onTestFinished }) => {
    const project = await createProject(onTestFinished);
    await project.setup();
    await project.write('bad.js', 'eval("1 + 2");\n');
    await project.write('.gitignore', 'node_modules\nignored\n');
    await mkdir(join(project.dir, 'ignored'));
    await project.write('ignored/bad.js', 'eval("1 + 2");\n');
    await project.write(
      'ignored/oxlint.config.ts',
      "import { writeFileSync } from 'node:fs';\n\nwriteFileSync('evaluated', '');\n\nexport default {};\n",
    );
    await symlink('missing', join(project.dir, 'ignored/.oxlintrc.json'));

    const setup = await project.setup('--baseline');
    expect(setup.status, setup.stderr).toBe(0);
    expect(await readdir(project.dir)).not.toContain('evaluated');
    expect(await project.json('oxlint-suppressions.json')).toEqual({
      'bad.js': { 'no-eval': { count: 1 } },
    });
  });

  test('the baseline matches a config that depends on the working directory', async ({
    onTestFinished,
  }) => {
    const project = await createProject(onTestFinished);
    await project.write('package.json', '{"type":"module"}');
    await project.write(
      'oxlint.config.ts',
      "import { existsSync } from 'node:fs';\nimport preset from 'auto-anti-slop';\n\nexport default { ...preset, rules: { ...preset.rules, 'no-alert': existsSync('package.json') ? 'error' : 'off' } };\n",
    );
    await project.write('bad.js', 'eval("1 + 2");\nalert("1");\n');
    expect((await project.setup('--baseline')).status).toBe(0);
    expect((await project.json('oxlint-suppressions.json'))['bad.js']).toMatchObject({
      'no-alert': { count: 1 },
      'no-eval': { count: 1 },
    });
    const lint = () => run('npx', ['--no-install', 'oxlint'], { cwd: project.dir });
    expect((await lint()).status).toBe(0);

    // A refresh sees past the baseline, and the hook prunes only what was fixed.
    const before = await project.read('oxlint-suppressions.json');
    expect((await project.setup('--baseline')).status).toBe(0);
    expect(await project.read('oxlint-suppressions.json')).toBe(before);
    await project.write('bad.js', 'alert("1");\n');
    expect((await project.hook('claude')).status).toBe(0);
    expect((await project.json('oxlint-suppressions.json'))['bad.js']).toEqual({
      'no-alert': { count: 1 },
    });
    expect((await lint()).status).toBe(0);
  });

  test('a dangling baseline symlink is written through', async ({ onTestFinished }) => {
    const record = async (...args) => {
      const project = await createProject(onTestFinished);
      await project.write('bad.js', 'eval("1 + 2");\n');
      await mkdir(join(project.dir, 'shared'));
      await symlink('shared/base.json', join(project.dir, 'oxlint-suppressions.json'));
      expect((await project.setup(...args)).status).toBe(0);
      expect((await lstat(join(project.dir, 'oxlint-suppressions.json'))).isSymbolicLink()).toBe(
        true,
      );
      expect(await project.json('shared/base.json')).toEqual({
        'bad.js': { 'no-eval': { count: 1 } },
      });
      expect(await readdir(join(project.dir, 'shared'))).toEqual(['base.json']);
    };

    await record();
    await record('--baseline');
  });

  test('setup records a baseline on a filesystem without hard links', async ({
    onTestFinished,
  }) => {
    const project = await createProject(onTestFinished);
    await project.write('bad.js', 'eval("1 + 2");\n');

    const preload = `import fs from 'node:fs';
      import { syncBuiltinESMExports } from 'node:module';
      fs.linkSync = () => { throw Object.assign(new Error('no hard links'), { code: 'EPERM' }); };
      syncBuiltinESMExports();`;

    const setup = await run(
      process.execPath,
      ['--import', `data:text/javascript,${encodeURIComponent(preload)}`, setupScript],
      { cwd: project.dir },
    );

    expect(setup.status, setup.stderr).toBe(0);
    expect(await project.json('oxlint-suppressions.json')).toEqual({
      'bad.js': { 'no-eval': { count: 1 } },
    });
  });

  test('a baseline linked into a read-only directory is rewritten in place', async ({
    onTestFinished,
  }) => {
    const project = await createProject(onTestFinished);
    const shared = join(project.dir, 'shared');
    await project.setup();
    await project.write('bad.js', 'eval("1 + 2");\n');
    await mkdir(shared);
    await project.write('shared/base.json', baselineOf(1));
    await symlink('shared/base.json', join(project.dir, 'oxlint-suppressions.json'));
    await chmod(shared, 0o555);
    onTestFinished(() => chmod(shared, 0o755));

    const setup = await project.setup('--baseline');
    expect(setup.status, setup.stderr).toBe(0);
    expect(await project.json('shared/base.json')).toEqual({
      'bad.js': { 'no-eval': { count: 1 } },
    });
  });

  test('plugins see the project as the working directory', async ({ onTestFinished }) => {
    const project = await createProject(onTestFinished);
    await project.write('package.json', '{"type":"module"}');
    await project.write(
      'plugin.js',
      "import { existsSync } from 'node:fs';\nimport { join } from 'node:path';\n\nexport default { meta: { name: 'local' }, rules: { root: { create: (context) => ({ Program(node) { if (existsSync(join(context.cwd, 'package.json'))) { context.report({ message: 'In the project.', node }); } } }) } } };\n",
    );
    await project.write(
      'oxlint.config.ts',
      "import preset from 'auto-anti-slop';\n\nexport default { ...preset, ignorePatterns: [...preset.ignorePatterns, 'plugin.js', 'oxlint.config.ts'], jsPlugins: [...preset.jsPlugins, { name: 'local', specifier: import.meta.resolve('./plugin.js') }], rules: { ...preset.rules, 'local/root': 'error' } };\n",
    );
    await project.write('fine.js', 'export const a = 1;\n');

    const setup = await project.setup('--baseline');
    expect(setup.status, setup.stderr).toBe(0);
    expect(await project.json('oxlint-suppressions.json')).toEqual({
      'fine.js': { 'local/root': { count: 1 } },
    });
    expect((await run('npx', ['--no-install', 'oxlint'], { cwd: project.dir })).status).toBe(0);
  });

  test('setup stops if Oxlint would apply the old baseline to the scan', async ({
    onTestFinished,
  }) => {
    const project = await createProject(onTestFinished);
    await project.setup();
    await project.write('bad.js', 'eval("1 + 2");\n');
    await project.write('oxlint-suppressions.json', baselineOf(1));

    // An Oxlint whose check run reports nothing, as if the baseline beside it applied, or one
    // whose plugin sees another directory.
    for (const [stdout, problem] of [
      ['{"diagnostics":[]}', 'applies oxlint-suppressions.json'],
      ['no-eval other-cwd', 'context.cwd'],
    ]) {
      const preload = `import childProcess from 'node:child_process';
        import { syncBuiltinESMExports } from 'node:module';
        const original = childProcess.spawnSync;
        childProcess.spawnSync = (command, args, options) =>
          args.includes('--no-ignore') ? { status: 0, stdout: '${stdout}' } : original(command, args, options);
        syncBuiltinESMExports();`;

      const setup = await run(
        process.execPath,
        [
          '--import',
          `data:text/javascript,${encodeURIComponent(preload)}`,
          setupScript,
          '--baseline',
        ],
        { cwd: project.dir },
      );

      expect(setup.status).toBe(1);
      expect(setup.stderr).toContain(problem);
      expect(await project.read('oxlint-suppressions.json')).toBe(baselineOf(1));
    }
  });

  test('setup stops if a config changes while it reads the configs again', async ({
    onTestFinished,
  }) => {
    for (const [action, problem] of [
      [
        "utimesSync(root('oxlint.config.ts'), new Date(), new Date(Date.now() + 5000));",
        'oxlint.config.ts: changed',
      ],
      ["writeFileSync(root('.oxlintrc.json'), '{}');", '.oxlintrc.json: created'],
      [
        "mkdirSync(root('late')); writeFileSync(root('late/a.js'), ''); writeFileSync(root('late/.oxlintrc.json'), '{}');",
        `${join('late', '.oxlintrc.json')}: created`,
      ],
    ]) {
      const project = await createProject(onTestFinished);
      await project.setup();
      await project.write('oxlint-suppressions.json', baselineOf(1));
      await mkdir(join(project.dir, 'nested'));
      await project.write('nested/a.js', 'export const a = 1;\n');
      await project.write('nested/oxlint.config.ts', acting(action));

      const setup = await project.setup('--baseline');
      expect(setup.status).toBe(1);
      expect(setup.stderr).toContain(`${problem} during setup`);
      expect(await project.read('oxlint-suppressions.json')).toBe(baselineOf(1));
    }
  });

  test('a config can read files in any order, and handle a failed read', async ({
    onTestFinished,
  }) => {
    const project = await createProject(onTestFinished);
    await project.write('a.txt', 'a\n');
    await project.write('b.txt', 'b\n');
    await project.write('oxlint-suppressions.json', baselineOf(1));
    await project.write(
      'oxlint.config.ts',
      "import { existsSync, readFileSync, writeFileSync } from 'node:fs';\nimport { readFile } from 'node:fs/promises';\nimport preset from 'auto-anti-slop';\n\nconst files = ['a.txt', 'b.txt'];\n\nif (!process.argv.includes('--print-config')) {\n  writeFileSync('node_modules/scanned', '');\n} else if (existsSync('node_modules/scanned')) {\n  files.reverse();\n}\n\nfor (const file of files) {\n  readFileSync(file);\n}\n\nawait readFile(new URL('https://example.com/')).catch(() => '');\n\nexport default { ...preset };\n",
    );

    const setup = await project.setup('--baseline');
    expect(setup.status, setup.stderr).toBe(0);
    expect(Object.keys(await project.json('oxlint-suppressions.json'))).not.toContain('gone.js');
  });

  test('the hook says why it left the baseline unpruned', async ({ onTestFinished }) => {
    const project = await createProject(onTestFinished);
    await project.setup();
    await project.write('bad.js', 'eval("1 + 2");\n');
    await project.write(
      'oxlint-suppressions.json',
      JSON.stringify({ 'bad.js': { 'no-eval': { count: 2 } }, ...JSON.parse(baselineOf(1)) }),
    );

    const preload = `import childProcess from 'node:child_process';
      import { syncBuiltinESMExports } from 'node:module';
      const original = childProcess.spawnSync;
      childProcess.spawnSync = (command, args, options) =>
        args.includes('--no-ignore') ? { status: 0, stdout: '{"diagnostics":[]}' } : original(command, args, options);
      syncBuiltinESMExports();`;

    const hook = await run(
      process.execPath,
      ['--import', `data:text/javascript,${encodeURIComponent(preload)}`, hookScript, 'claude'],
      { cwd: project.dir, input: '{}' },
    );

    expect(hook.status).toBe(2);
    expect(hook.stderr).toContain("wasn't pruned: This Oxlint version applies");
    expect(await project.json('oxlint-suppressions.json')).toEqual({
      'bad.js': { 'no-eval': { count: 2 } },
      ...JSON.parse(baselineOf(1)),
    });
  });

  test('the hook names the errors that stop it pruning', async ({ onTestFinished }) => {
    const project = await createProject(onTestFinished);
    const recorded = JSON.stringify({ 'bad.js': { 'no-eval': { count: 2 } } });
    await project.setup();
    await project.write('bad.js', 'eval("1 + 2");\n');
    await project.write('broken.js', 'const = ;\n');
    await project.write('oxlint-suppressions.json', recorded);

    const hook = await project.hook('claude');
    expect(hook.status).toBe(2);
    expect(hook.stderr).toMatch(/Couldn't prune suppressions for existing files\..*\nbroken\.js: /);
    expect(await project.read('oxlint-suppressions.json')).toBe(recorded);
  });

  test('setup sees the files a config opens to read', async ({ onTestFinished }) => {
    const dir = await mkdtemp(join(tmpdir(), 'auto-anti-slop-reads-'));
    onTestFinished(() => rm(dir, { force: true, recursive: true }));

    const script = `import fs, { constants, createReadStream, openSync } from 'node:fs';
      import { open } from 'node:fs/promises';
      await (await open('handle.txt', constants.O_RDONLY)).close();
      fs.open('callback.txt', () => {});
      createReadStream('stream.txt').resume();
      openSync('appended.txt', 'a+');
      openSync('synchronous.txt', 'sr');
      openSync('written.txt', 'w');`;

    const files = ['appended.txt', 'callback.txt', 'handle.txt', 'stream.txt', 'synchronous.txt'];

    for (const file of files) {
      await writeFile(join(dir, file), '');
    }

    const preload = new URL('../hooks/config-modules.mjs', import.meta.url).href;
    const args = ['--import', preload, '--input-type=module', '-e', script];
    const { stderr } = await run(process.execPath, args, { cwd: dir });
    const read = Object.keys(JSON.parse(/^config-modules (.*)$/m.exec(stderr)[1]));

    expect(new Set(read.map((file) => basename(file)))).toEqual(new Set(files));
  });

  test.skipIf(process.platform !== 'darwin')(
    'a replaced baseline keeps its ACL',
    async ({ onTestFinished }) => {
      const project = await createProject(onTestFinished);
      const file = join(project.dir, 'oxlint-suppressions.json');
      await project.setup();
      await project.write('bad.js', 'eval("1 + 2");\n');
      await project.write('oxlint-suppressions.json', baselineOf(1));
      const acl = () => spawnSync('ls', ['-le', file], { encoding: 'utf8' }).stdout;
      const recorded = { 'bad.js': { 'no-eval': { count: 1 } } };
      spawnSync('chmod', ['+a', 'everyone allow read', file]);

      expect((await project.setup('--baseline')).status).toBe(0);
      expect(await project.json('oxlint-suppressions.json')).toEqual(recorded);
      expect(acl()).toContain('everyone allow');

      // An ACL that stops the copy: the file is written in place.
      await project.write('oxlint-suppressions.json', baselineOf(1));
      spawnSync('chmod', ['+a', 'everyone deny read', file]);
      expect((await project.setup('--baseline')).status).toBe(0);
      expect(acl()).toContain('everyone deny read');
      spawnSync('chmod', ['-N', file]);
      expect(await project.json('oxlint-suppressions.json')).toEqual(recorded);

      // The same without `cp`.
      await project.write('oxlint-suppressions.json', baselineOf(1));
      spawnSync('chmod', ['+a', 'everyone allow read', file]);
      const bin = join(project.dir, 'node_modules/.node');
      await mkdir(bin);
      await symlink(process.execPath, join(bin, 'node'));

      const setup = await run(process.execPath, [setupScript, '--baseline'], {
        cwd: project.dir,
        env: { PATH: bin },
      });

      expect(setup.status, setup.stderr).toBe(0);
      expect(acl()).toContain('everyone allow');
      expect(await project.json('oxlint-suppressions.json')).toEqual(recorded);
    },
  );

  test('a hard-linked baseline keeps its links', async ({ onTestFinished }) => {
    const project = await createProject(onTestFinished);
    await project.setup();
    await project.write('bad.js', 'eval("1 + 2");\n');
    await project.write('oxlint-suppressions.json', baselineOf(1));
    await link(join(project.dir, 'oxlint-suppressions.json'), join(project.dir, 'linked.json'));

    expect((await project.setup('--baseline')).status).toBe(0);
    expect(await project.json('linked.json')).toEqual({ 'bad.js': { 'no-eval': { count: 1 } } });
  });

  test('replacing a baseline keeps its permissions and symlink', async ({ onTestFinished }) => {
    const project = await createProject(onTestFinished);
    const link = join(project.dir, 'oxlint-suppressions.json');
    const shared = join(project.dir, 'shared/base.json');
    await project.setup();
    await project.write('bad.js', 'eval("1 + 2");\n');
    await mkdir(join(project.dir, 'shared'));
    await project.write('shared/base.json', baselineOf(1));
    await chmod(shared, 0o600);
    await symlink('shared/base.json', link);

    const expectKept = async (recorded) => {
      expect(await project.json('shared/base.json')).toEqual(recorded);
      expect((await lstat(link)).isSymbolicLink()).toBe(true);
      expect(await permissions(shared)).toBe('600');
    };

    expect((await project.setup('--baseline')).status).toBe(0);
    await expectKept({ 'bad.js': { 'no-eval': { count: 1 } } });
    expect(await readdir(join(project.dir, 'shared'))).toEqual(['base.json']);

    await project.remove('bad.js');
    expect((await project.hook('claude')).status).toBe(0);
    await expectKept({});

    await rm(link);
    await project.write('oxlint-suppressions.json', baselineOf(1));
    await chmod(link, 0o600);
    expect((await project.hook('claude')).status).toBe(0);
    expect(await project.json('oxlint-suppressions.json')).toEqual({});
    expect(await permissions(link)).toBe('600');
  });

  test('setup explains a scan that cannot start', async ({ onTestFinished }) => {
    const project = await createProject(onTestFinished);

    for (const method of ['spawnSync', 'spawn']) {
      const preload = `import childProcess from 'node:child_process';
        import { syncBuiltinESMExports } from 'node:module';
        const original = childProcess.${method};
        childProcess.${method} = (command, ...rest) => original('/missing', ...rest);
        syncBuiltinESMExports();`;

      const setup = await run(
        process.execPath,
        ['--import', `data:text/javascript,${encodeURIComponent(preload)}`, setupScript],
        { cwd: project.dir },
      );

      expect(setup.status).toBe(1);
      expect(setup.stderr).toContain('spawn');
      expect(setup.stderr).toContain('ENOENT');
      expect(setup.stderr).toContain('No baseline');
      await expect(project.read('oxlint.config.ts')).rejects.toThrow('ENOENT');
    }
  });

  test('setup that stops while installing hooks has already recorded its baseline', async ({
    onTestFinished,
  }) => {
    const project = await createProject(onTestFinished);
    await project.write('bad.js', 'eval("1 + 2");\n');
    await project.write('.claude', 'in the way');
    expect((await project.setup()).status).not.toBe(0);
    await project.remove('.claude');
    expect((await project.setup()).status).toBe(0);
    expect((await project.json('oxlint-suppressions.json'))['bad.js']).toBeDefined();
    expect((await project.hook('claude')).status).toBe(0);
  });

  test('setup that is killed while recording changes nothing', async ({ onTestFinished }) => {
    const project = await createProject(onTestFinished);
    await project.write('bad.js', 'eval("1 + 2");\n');

    const killWhileRecording = async (...args) => {
      const child = spawn(process.execPath, [setupScript, ...args], {
        cwd: project.dir,
        env: { ...process.env, VP_VERSION: undefined },
      });

      child.stdout.on('data', (data) => {
        if (String(data).includes('recording existing findings')) {
          child.kill('SIGKILL');
        }
      });
      expect(await once(child, 'close')).toEqual([null, 'SIGKILL']);
      // Oxlint outlives setup: let it finish.
      await setTimeout(3000);
    };

    // A first setup can be run again, and what it left behind isn't linted.
    await killWhileRecording();
    expect(await readdir(project.dir)).not.toContain('oxlint.config.ts');
    expect((await project.setup()).status).toBe(0);
    const before = await project.read('oxlint-suppressions.json');
    expect(JSON.parse(before)).toEqual({ 'bad.js': { 'no-eval': { count: 1 } } });
    expect((await project.hook('claude')).status).toBe(0);
    expect((await run('npx', ['--no-install', 'oxlint'], { cwd: project.dir })).status).toBe(0);

    await project.write('bad.js', 'eval("1 + 2");\n\neval("3 + 4");\n');
    await killWhileRecording('--baseline');
    expect(await project.read('oxlint-suppressions.json')).toBe(before);
    expect((await project.hook('claude')).status).toBe(2);
  });

  // Setup and the hook write the baseline from Oxlint's report, so a new Oxlint could disagree.
  test('setup records what Oxlint would', async ({ onTestFinished }) => {
    const project = await createProject(onTestFinished);
    await mkdir(join(project.dir, 'nested/ignored'), { recursive: true });
    await project.write('.gitignore', 'node_modules\n/nested/ignored/\n');
    await project.write(
      'oxlint.config.ts',
      "import preset from 'auto-anti-slop';\n\nexport default { ...preset, ignorePatterns: ['left-out.js'], overrides: [...preset.overrides, { files: ['allowed.js'], rules: { 'no-eval': 'off' } }] };\n",
    );
    await project.write('tsconfig.json', '{"compilerOptions":{"strict":true}}');
    await project.write(
      'nested/oxlint.config.ts',
      "export default { rules: { 'no-alert': 'error' } };\n",
    );
    await project.write('nested/alert.js', 'alert("1");\neval("1");\n');

    for (const path of ['bad', 'left-out', 'allowed', 'nested/ignored/bad', 'nested/[x] ü']) {
      await project.write(`${path}.js`, 'eval("1 + 2");\neval("3 + 4");\n');
    }

    // Core, typescript, type-aware, unicorn, import and JS plugin rules.
    await project.write(
      'a.ts',
      "import { b } from './b';\nexport async function a(x: unknown): Promise<any> { return b(x) as any; }\na(1);\nlet list = [2, 1].filter((n) => n > 1).map((n) => n).sort();\nif (list == null) { console.log(list); }\nexport function deep(p: number) { if (p) { for (const i of [p]) { if (i) { while (p) { if (p && i || p) { return 1; } } } } } return 2; }\n",
    );
    await project.write(
      'b.ts',
      "import { a } from './a';\nexport const b = (x: unknown): unknown => a(x);\n",
    );
    await project.write(
      'a.test.ts',
      "import { test, vi } from 'vitest';\nvi.mock('./a');\ntest.only('x', () => {});\n",
    );

    const setup = await project.setup('--baseline');
    expect(setup.status, setup.stderr).toBe(0);
    const recorded = await project.json('oxlint-suppressions.json');
    await project.remove('oxlint-suppressions.json');
    await run('npx', ['--no-install', 'oxlint', '--suppress-all'], { cwd: project.dir });
    expect(recorded).toEqual(await project.json('oxlint-suppressions.json'));

    const plugins = Object.values(recorded).flatMap((rules) =>
      Object.keys(rules).map((rule) => (rule.includes('/') ? rule.split('/')[0] : 'eslint')),
    );

    expect(plugins).toEqual(
      expect.arrayContaining([
        'anti-slop',
        'eslint',
        'import',
        'sonarjs',
        'typescript',
        'unicorn',
        'vitest',
      ]),
    );
  });

  test('setup and the hook work with read-only dependencies', async ({ onTestFinished }) => {
    const project = await createProject(onTestFinished);
    const modules = join(project.dir, 'node_modules');
    await chmod(modules, 0o555);
    onTestFinished(() => chmod(modules, 0o755));
    expect((await project.setup()).status).toBe(0);
    expect((await project.setup()).status).toBe(0);
    await project.write('bad.js', 'eval("1 + 2");\n');
    expect((await project.hook('claude')).stderr).toContain('no-eval');
  });

  test('a baseline the hook cannot prune does not hide findings', async ({ onTestFinished }) => {
    const project = await createProject(onTestFinished);
    await project.setup();
    await project.write('bad.js', 'eval("1 + 2");\n');

    for (const baseline of [
      'not json',
      '"bad.js"',
      baselineOf('garbled'),
      baselineOf(-1),
      baselineOf(0),
    ]) {
      await project.write('oxlint-suppressions.json', baseline);
      const malformed = await project.hook('claude');
      expect(malformed.status).toBe(2);
      expect(malformed.stderr).toContain('no-eval');
      expect(await project.read('oxlint-suppressions.json')).toBe(baseline);
    }

    const readOnly = baselineOf(1);
    await project.write('oxlint-suppressions.json', readOnly);
    await chmod(join(project.dir, 'oxlint-suppressions.json'), 0o444);
    const unwritable = await project.hook('claude');
    expect(unwritable.status).toBe(2);
    expect(unwritable.stderr).toContain('no-eval');
    expect(await project.read('oxlint-suppressions.json')).toBe(readOnly);
  });
});
