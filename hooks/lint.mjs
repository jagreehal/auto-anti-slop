#!/usr/bin/env node
// Copyright (c) 2026 Jag Reehal
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

// Agent Stop hook: lint the source files git shows as changed and hand failures back to
// the agent. Usage: node lint.mjs <claude|codex|cursor>, with the hook's JSON on stdin.
// Silent when clean, when there is no git repository, or on a second attempt in a row.
// Findings recorded in oxlint-suppressions.json don't count; fixed ones and deleted files are
// pruned from it.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const agent = process.argv[2];
let input = {};

try {
  input = JSON.parse(readFileSync(0, 'utf8')) ?? {};
} catch {
  // No or malformed hook input: lint anyway, as on a first attempt.
}

const source = /\.(?:[cm]?[jt]sx?)$/;

// Report without blocking again when the agent already had one try, so it can't loop.
const retry = agent === 'cursor' ? input.loop_count > 0 : input.stop_hook_active === true;

// Skip aborted or errored turns; a missing status (bad input) still lints.
if (agent === 'cursor' && input.status !== undefined && input.status !== 'completed') {
  process.exit(0);
}

const git = (...args) => spawnSync('git', args, { encoding: 'utf8' });
const root = git('rev-parse', '--show-toplevel').stdout.trim();

if (!root) {
  process.exit(0);
}

// "XY path\0", with a rename or copy followed by its old path, which is skipped.
const entries = git(
  '-C',
  root,
  'status',
  '--porcelain',
  '-z',
  '--untracked-files=all',
).stdout.split('\0');

const files = [];

for (let index = 0; index < entries.length; index++) {
  const entry = entries[index];

  if (/[RC]/.test(entry.slice(0, 2))) {
    index++;
  }

  const file = entry.slice(3);

  if (source.test(file) && !file.endsWith('.d.ts') && existsSync(`${root}/${file}`)) {
    files.push(file);
  }
}

// Drop baseline entries for deleted files, so a new file at the same path starts clean.
const suppressions = `${root}/oxlint-suppressions.json`;
let recorded;

try {
  recorded = JSON.parse(readFileSync(suppressions, 'utf8'));
} catch {
  // Missing or malformed: leave it to Oxlint, which reports the findings regardless.
}

const isObject = (value) => value?.constructor === Object;

// Only prune the shape Oxlint writes, { path: { rule: { count } } }, so a hand-edited or corrupt
// file is left for Oxlint to report rather than rewritten.
const isBaseline = (value) =>
  isObject(value) &&
  Object.values(value).every(
    (rules) =>
      isObject(rules) &&
      Object.values(rules).every(
        (entry) => isObject(entry) && Number.isInteger(entry.count) && entry.count > 0,
      ),
  );

if (isBaseline(recorded)) {
  const entries = Object.entries(recorded);
  const kept = entries.filter(([file]) => existsSync(`${root}/${file}`));

  if (kept.length < entries.length) {
    try {
      writeFileSync(suppressions, JSON.stringify(Object.fromEntries(kept), null, 2));
    } catch {
      // Read-only: lint anyway; Oxlint ignores entries for files that no longer exist.
    }
  }
}

if (files.length === 0) {
  process.exit(0);
}

const oxlint = fileURLToPath(new URL('bin/oxlint', import.meta.resolve('oxlint/package.json')));

const lint = (...args) =>
  spawnSync(process.execPath, [oxlint, ...args, ...files], { cwd: root, encoding: 'utf8' });

let result = lint();

// The agent fixed findings recorded in oxlint-suppressions.json: shrink the baseline to match.
if (/suppressions that do not occur anymore/.test(result.stdout + result.stderr)) {
  lint('--prune-suppressions');
  result = lint();
}

if (result.status === 0) {
  process.exit(0);
}

const report = `Oxlint found problems in files changed in this session:\n\n${result.stdout}${result.stderr}
Fix the code rather than disabling rules or running \`oxlint --suppress-all\`.
\`npx oxlint --fix <file>\` applies the autofixes.`;

// Cursor's followup_message re-prompts the agent, so on a retry it would block again.
if (retry) {
  console.error(`${report}\n(Already asked once; not blocking again.)`);
} else if (agent === 'cursor') {
  console.log(JSON.stringify({ followup_message: report }));
} else {
  console.error(report);
  process.exit(2);
}
