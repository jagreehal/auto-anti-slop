#!/usr/bin/env node
// Copyright (c) 2026 Jag Reehal
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

// Set up a project to use the preset: an oxlint config, a lint hook for Claude Code, Codex and
// Cursor, an AGENTS.md section, and the migration skill. Run from the project root. Keeps
// existing files and settings. When it creates the config, it records the project's current
// findings in oxlint-suppressions.json, unless that file exists. --baseline records them again.

import { spawn, spawnSync } from 'node:child_process';
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { constants } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import {
  baseline,
  createBaseline,
  createScratch,
  inProject,
  parseReport,
  publishBaseline,
} from '../hooks/baseline.mjs';
import preset from '../index.js';

const { name } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const hook = `node_modules/${name}/hooks/lint.mjs`;

function readJson(file, fallback) {
  if (!existsSync(file)) {
    return fallback;
  }

  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    // Never overwrite a file we can't parse: it holds the user's settings.
    console.error(`Skipped ${file}: it isn't valid JSON. Add the hook by hand.`);

    return null;
  }
}

function addHook({ entry, event, fallback = {}, file }) {
  const config = readJson(file, fallback);

  if (config === null) {
    return;
  }

  config.hooks ??= {};
  config.hooks[event] ??= [];

  if (JSON.stringify(config.hooks[event]).includes(hook)) {
    console.log(`${file}: hook already present`);

    return;
  }

  config.hooks[event].push(entry);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
  console.log(`${file}: added the lint hook to ${event}`);
}

let child;

for (const signal of ['SIGHUP', 'SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    child?.kill(signal);
    process.exit(128 + constants.signals[signal]);
  });
}

// Oxlint errors when one directory has two of these, so never add a second.
const configs = ['.oxlintrc.json', '.oxlintrc.jsonc', 'oxlint.config.ts', 'oxlint.config.mts'];
const findConfig = () => configs.find((file) => existsSync(file));

const oxlint = fileURLToPath(new URL('bin/oxlint', import.meta.resolve('oxlint/package.json')));

// Resolve the config as well as reading it, because it can import other files.
function readConfig(file, ...args) {
  const printed = spawnSync(process.execPath, [oxlint, '--print-config', ...args], {
    encoding: 'utf8',
  });

  return { file, resolved: printed.stdout, source: readFileSync(file, 'utf8') };
}

function readRootConfig() {
  const file = findConfig();

  return file === undefined ? undefined : readConfig(file);
}

const readNestedConfigs = (dirs) =>
  new Map(
    dirs
      .flatMap((dir) => configs.map((name) => join(dir, name)))
      .filter((file) => existsSync(file))
      .map((file) => [file, readConfig(file, '-c', file)]),
  );

const config = readRootConfig();
const existing = config?.file;

// An existing config without the preset would lint, and baseline, without its rules. Require the
// preset's own plugin, and at least half as many error-level rules as the preset sets. Rule names
// can't be matched one by one: Oxlint renames some rules and drops disabled plugin rules when it
// resolves a config.
function usesPreset({ resolved }) {
  const plugin = import.meta.resolve('../anti-slop/index.js');

  try {
    const { jsPlugins = [], rules = {} } = JSON.parse(resolved);

    const errors = Object.values(rules).filter(
      (value) => (Array.isArray(value) ? value[0] : value) === 'deny',
    );

    return (
      jsPlugins.some(({ specifier }) => specifier === plugin) &&
      errors.length >= Object.keys(preset.rules).length / 2
    );
  } catch {
    return false;
  }
}

const missingPreset = config !== undefined && !usesPreset(config);

const defaultConfig = `import preset from '${name}';
import { defineConfig } from 'oxlint';

export default defineConfig({ ...preset });
`;

// A first setup starts clean, but never adds new findings to a baseline that already exists.
const firstSetup = existing === undefined && !existsSync(baseline);
const replace = process.argv.includes('--baseline');

if (missingPreset) {
  console.error(
    `${existing}: doesn't use ${name}. Add it, then run setup again:\n` +
      `  import preset from '${name}';  export default defineConfig({ ...preset, ...yourSettings });\n` +
      `A JSON config can't load the preset: move it to oxlint.config.ts.`,
  );
} else if (existing) {
  console.log(`${existing}: already present`);
}

// Oxlint resolves a config's ignorePatterns within its own directory, which for a config in the
// scratch directory leaves out the project. On the command line they apply everywhere. The config
// isn't in the project yet, so there may be no files to lint.
const generatedScope = [
  '--no-error-on-unmatched-pattern',
  ...preset.ignorePatterns.map((pattern) => `--ignore-pattern=${pattern}`),
];

const scope = existing === undefined ? generatedScope : [];

// Where Oxlint looks for nested configs: the directories of the files it finds, and those above
// them. A config's own ignorePatterns don't count, because a nested config overrides the root's.
function findNestedDirectories(scratch) {
  const empty = join(scratch, 'empty.json');
  const args = ['--debug=files', '--disable-nested-config', '-c', empty, ...generatedScope];
  writeFileSync(empty, '{}');

  const listed = spawnSync(process.execPath, [oxlint, ...args, process.cwd()], {
    cwd: scratch,
    encoding: 'utf8',
    maxBuffer: Infinity,
  });

  if (listed.error) {
    throw listed.error;
  }

  if (listed.status !== 0) {
    throw new Error(`Oxlint couldn't list the files to lint.\n${listed.stdout}${listed.stderr}`);
  }

  const dirs = new Set();

  for (const file of listed.stdout.trim().split('\n')) {
    let dir = dirname(relative('.', file));

    while (dir !== '.' && !dirs.has(dir)) {
      dirs.add(dir);
      dir = dirname(dir);
    }
  }

  return [...dirs];
}

function report(scratch) {
  return new Promise((resolve, reject) => {
    const args = ['--format=json', ...scope, process.cwd()];
    child = spawn(process.execPath, [...inProject, oxlint, ...args], { cwd: scratch });
    child.on('error', reject);
    const result = { scratch, stderr: '', stdout: '' };

    for (const stream of ['stderr', 'stdout']) {
      child[stream].setEncoding('utf8').on('data', (data) => (result[stream] += data));
    }

    child.on('close', (status) => resolve({ ...result, status }));
  });
}

// Keeps the baseline in step with the config, and one config per directory.
function stopIfConfigChanged(before, current) {
  if (!isDeepStrictEqual(current, before)) {
    const change = before === undefined ? 'created' : 'changed';

    console.error(
      `${(current ?? before).file}: ${change} during setup. Run setup again to use it.`,
    );
    process.exit(1);
  }
}

function stopIfAnyConfigChanged(dirs, nested) {
  stopIfConfigChanged(config, readRootConfig());
  const current = readNestedConfigs(dirs);

  for (const file of new Set([...nested.keys(), ...current.keys()])) {
    stopIfConfigChanged(nested.get(file), current.get(file));
  }
}

function stopWithoutBaseline(problem) {
  console.error(
    `${problem}\nNo baseline: fix the errors above, then run this again. To leave files out instead, create oxlint.config.ts with ignorePatterns and run this with --baseline.`,
  );
  process.exit(1);
}

async function recordBaseline() {
  const scratch = createScratch(process.cwd());

  // The config is created last, so that a first setup which stops early can be run again.
  if (existing === undefined) {
    writeFileSync(join(scratch, 'oxlint.config.ts'), defaultConfig);
  }

  let result;

  try {
    const dirs = findNestedDirectories(scratch);
    const nested = readNestedConfigs(dirs);
    const reporting = report(scratch);
    console.log(`${baseline}: recording existing findings`);
    result = await reporting;
    stopIfAnyConfigChanged(dirs, nested);

    const { entries, unrecordable } = parseReport(result, process.cwd());

    if (unrecordable.length > 0) {
      throw new Error(unrecordable.join('\n'));
    }

    if (Object.keys(entries).length > 0 || existsSync(baseline)) {
      (replace ? publishBaseline : createBaseline)(process.cwd(), scratch, entries);
      console.log(`${baseline}: recorded existing findings; commit it`);
    }
  } catch (error) {
    // Another writer got there first: keep theirs.
    if (error.code === 'EEXIST') {
      console.log(`${baseline}: already present`);

      return;
    }

    const unreadable = error instanceof SyntaxError ? result.stdout + result.stderr : '';
    stopWithoutBaseline(unreadable || error.message);
  }
}

if (firstSetup || replace) {
  if (missingPreset) {
    console.error('Skipped --baseline: it would record findings without the preset.');
    process.exit(1);
  }

  await recordBaseline();
}

if (existing === undefined) {
  stopIfConfigChanged(config, readRootConfig());
  // Fails rather than replace a config that has appeared since.
  writeFileSync('oxlint.config.ts', defaultConfig, { flag: 'wx' });
  console.log('oxlint.config.ts: created');
}

const command = (prefix, agent) => `node ${prefix}${hook} ${agent}`;

addHook({
  entry: {
    hooks: [
      { command: command('"$CLAUDE_PROJECT_DIR"/', 'claude'), timeout: 120, type: 'command' },
    ],
  },
  event: 'Stop',
  file: '.claude/settings.json',
});

addHook({
  entry: {
    hooks: [
      {
        command: command('"$(git rev-parse --show-toplevel)"/', 'codex'),
        timeout: 120,
        type: 'command',
      },
    ],
  },
  event: 'Stop',
  file: '.codex/hooks.json',
});

addHook({
  entry: { command: command('"$(git rev-parse --show-toplevel)"/', 'cursor') },
  event: 'stop',
  fallback: { version: 1 },
  file: '.cursor/hooks.json',
});

const skill = fileURLToPath(new URL('../skills/migrate-oxlint-config', import.meta.url));

for (const dir of ['.claude/skills', '.agents/skills']) {
  const target = `${dir}/migrate-oxlint-config`;

  if (existsSync(target)) {
    console.log(`${target}: already present`);
  } else {
    cpSync(skill, target, { recursive: true });
    console.log(`${target}: copied`);
  }
}

// Codex and Cursor read AGENTS.md, so the agent knows why the hook stops it.
const heading = `## Linting (${name})`;
const agents = existsSync('AGENTS.md') ? readFileSync('AGENTS.md', 'utf8') : '';

if (agents.includes(heading)) {
  console.log('AGENTS.md: lint section already present');
} else {
  // Leave one blank line between the existing content and the new section.
  const separator =
    agents === '' ? '' : '\n'.repeat(Math.max(0, 2 - /\n*$/.exec(agents)[0].length));

  appendFileSync(
    'AGENTS.md',
    `${separator}${heading}

When you finish a turn, a hook lints the files you changed with Oxlint and sends back any
errors. Fix the code; don't disable the rule or add an \`oxlint-disable\` comment unless the
user agrees. \`npx oxlint --fix <file>\` applies autofixes. Each rule is explained, with a fix,
in \`node_modules/${name}/docs/rules/\`. \`oxlint-suppressions.json\`, if present, records
existing findings: never run \`oxlint --suppress-all\` to hide new ones.

Fix structural errors (import cycles, exposed fields, long or complex code) from
first principles; don't move code around to silence them. Cycles: which module belongs at
which layer? Exposed fields: what do callers do with them, and what is the
narrowest interface that serves that? Fix related errors together, not one at a time.
`,
  );
  console.log('AGENTS.md: added the lint section');
}
