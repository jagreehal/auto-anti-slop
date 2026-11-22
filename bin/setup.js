#!/usr/bin/env node
// Copyright (c) 2026 Jag Reehal
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

// Set up a project to use the preset: an oxlint config, a lint hook for Claude Code, Codex and
// Cursor, an AGENTS.md section, and the migration skill. Run from the project root. Keeps
// existing files and settings. With --baseline, records the project's current findings in
// oxlint-suppressions.json so only new ones fail.

import { spawnSync } from 'node:child_process';
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
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

// Oxlint errors when one directory has two of these, so never add a second.
const configs = ['.oxlintrc.json', '.oxlintrc.jsonc', 'oxlint.config.ts', 'oxlint.config.mts'];
const existing = configs.find((file) => existsSync(file));

const oxlint = fileURLToPath(new URL('bin/oxlint', import.meta.resolve('oxlint/package.json')));

// An existing config without the preset would lint, and baseline, without its rules. Require the
// preset's own plugin, and at least half as many error-level rules as the preset sets. Rule names
// can't be matched one by one: Oxlint renames some rules and drops disabled plugin rules when it
// resolves a config.
function usesPreset() {
  const printed = spawnSync(process.execPath, [oxlint, '--print-config'], { encoding: 'utf8' });
  const plugin = import.meta.resolve('../anti-slop/index.js');

  try {
    const { jsPlugins = [], rules = {} } = JSON.parse(printed.stdout);

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

const missingPreset = existing !== undefined && !usesPreset();

if (missingPreset) {
  console.error(
    `${existing}: doesn't use ${name}. Add it, then run setup again:\n` +
      `  import preset from '${name}';  export default defineConfig({ ...preset, ...yourSettings });\n` +
      `A JSON config can't load the preset: move it to oxlint.config.ts.`,
  );
} else if (existing) {
  console.log(`${existing}: already present`);
} else {
  writeFileSync(
    'oxlint.config.ts',
    `import preset from '${name}';\nimport { defineConfig } from 'oxlint';\n\nexport default defineConfig({ ...preset });\n`,
  );
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
`,
  );
  console.log('AGENTS.md: added the lint section');
}

if (process.argv.includes('--baseline')) {
  if (missingPreset) {
    console.error('Skipped --baseline: it would record findings without the preset.');
    process.exit(1);
  }

  const result = spawnSync(process.execPath, [oxlint, '--suppress-all'], { stdio: 'inherit' });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  console.log('oxlint-suppressions.json: recorded existing findings; commit it');
}
